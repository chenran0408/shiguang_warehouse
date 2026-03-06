// 从 HTML 获取版

(function () {
    function safeToast(message) {
        try {
            window.AndroidBridge && AndroidBridge.showToast(message);
        } catch (_) {
            console.log("[Toast Fallback]", message);
        }
    }

    function firstNonEmpty(...values) {
        for (const value of values) {
            if (value !== undefined && value !== null && String(value).trim() !== "") {
                return String(value).trim();
            }
        }
        return "";
    }

    function parseValidWeeksBitmap(bitmap) {
        if (!bitmap || typeof bitmap !== "string") return [];
        const weeks = [];
        for (let i = 0; i < bitmap.length; i++) {
            if (bitmap[i] === "1") {
                if (i >= 1) weeks.push(i);
            }
        }
        return weeks;
    }

    function parseWeeksExpression(expr) {
        const text = (expr || "").trim();
        if (!text) return [];

        const oddOnly = text.startsWith("单");
        const evenOnly = text.startsWith("双");
        const raw = text.replace(/^[单双]/, "");

        const matchRange = raw.match(/^(\d+)\s*-\s*(\d+)$/);
        if (matchRange) {
            const start = parseInt(matchRange[1], 10);
            const end = parseInt(matchRange[2], 10);
            if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];
            const weeks = [];
            for (let w = start; w <= end; w++) {
                if (oddOnly && w % 2 === 0) continue;
                if (evenOnly && w % 2 !== 0) continue;
                weeks.push(w);
            }
            return weeks;
        }

        const nums = raw
            .split(/[，,、\s]+/)
            .map((t) => parseInt(t, 10))
            .filter((n) => !Number.isNaN(n) && n > 0);

        if (!oddOnly && !evenOnly) return nums;
        return nums.filter((w) => (oddOnly ? w % 2 === 1 : w % 2 === 0));
    }

    function normalizeWeeks(weeks) {
        const uniq = Array.from(new Set((weeks || []).filter((n) => Number.isInteger(n) && n > 0)));
        uniq.sort((a, b) => a - b);
        return uniq;
    }

    function cleanCourseName(name) {
        return String(name).replace(/\(\d+\)\s*$/, "").trim();
    }

    function extractTeacherFromCourse(obj) {
        return firstNonEmpty(
            obj.teacherName,
            obj.teachers,
            obj.teacher,
            obj.teacherNames,
            obj.teachername,
            obj.courseteacher
        );
    }

    function extractPositionFromCourse(obj) {
        return firstNonEmpty(
            obj.room,
            obj.roomName,
            obj.position,
            obj.place,
            obj.classroom,
            obj.location,
            obj.addr
        );
    }

    function extractWeeksFromCourse(obj) {
        return normalizeWeeks(parseValidWeeksBitmap(firstNonEmpty(
            obj.vaildWeeks,
            obj.validWeeks,
            obj.weeks,
            obj.weekBitmap,
            obj.weekString
        )));
    }

    function createCourseObject(name, teacher, position, day, startSection, endSection, weeks) {
        return {
            name: cleanCourseName(name),
            teacher: teacher || "",
            position: position || "",
            day,
            startSection,
            endSection,
            weeks: normalizeWeeks(weeks)
        };
    }

    function parseCourseNameAndTeacher(courseWithTeacher) {
        const text = (courseWithTeacher || "").trim();
        if (!text) return { name: "", teacher: "" };

        // 去掉课程名称末尾的序号
        let cleaned = cleanCourseName(text);

        // 匹配末尾教师名
        const match = cleaned.match(/^(.*)\s+\(([^()]*)\)\s*$/);
        if (match) {
            return {
                name: match[1].trim(),
                teacher: match[2].trim()
            };
        }

        return { name: cleaned, teacher: "" };
    }

    function parseTitleToCourses(titleText, day, section) {
        if (!titleText || !titleText.trim()) return [];

        const parts = titleText
            .split(";")
            .map((p) => p.trim())
            .filter((p) => p.length > 0);

        const results = [];

        for (let i = 0; i < parts.length; i++) {
            const current = parts[i];
            const next = parts[i + 1] || "";

            if (current.startsWith("(")) continue;

            const { name, teacher } = parseCourseNameAndTeacher(current);
            if (!name) continue;

            let weeks = [];
            let position = "";

            if (next.startsWith("(") && next.endsWith(")")) {
                const inner = next.slice(1, -1);
                const commaIndex = inner.indexOf(",");
                if (commaIndex >= 0) {
                    const weekExpr = inner.slice(0, commaIndex).trim();
                    position = inner.slice(commaIndex + 1).trim();
                    weeks = parseWeeksExpression(weekExpr);
                } else {
                    const isPureWeeks = /^\d+[-，,]|^[单双]\d/.test(inner);
                    if (isPureWeeks) {
                        weeks = parseWeeksExpression(inner);
                    } else {
                        position = inner;
                    }
                }
            }

            results.push(createCourseObject(name, teacher, position, day, section, section, weeks));
        }

        return results;
    }

    function parseFromCourseTableObjects() {
        const candidates = [];

        for (const key of Object.keys(window)) {
            if (!/^table\d+$/.test(key)) continue;
            const obj = window[key];
            if (obj && Array.isArray(obj.activities) && Number.isInteger(obj.unitCounts)) {
                candidates.push({ name: key, obj });
            }
        }

        const courses = [];

        for (const candidate of candidates) {
            const table = candidate.obj;
            const totalCells = table.activities.length;

            let unitCount = table.unitCounts;

            // 如果 unitCount > 7，尝试推断为总数，计算单行列数
            if (unitCount > 7 && totalCells > 0) {
                const deducedUnitCount = Math.floor(totalCells / 7);
                if (deducedUnitCount > 0 && deducedUnitCount < totalCells && deducedUnitCount <= 12) {
                    unitCount = deducedUnitCount;
                }
            }

            console.log(`[Debug] Table ${candidate.name}: unitCounts=${table.unitCounts}, totalCells=${totalCells}, deduced unitCount=${unitCount}`);

            if (unitCount < 1 || unitCount >= totalCells) {
                console.warn(`[Warn] Invalid unitCount ${unitCount} for table ${candidate.name}, skip`);
                continue;
            }

            for (let index = 0; index < totalCells; index++) {
                const activitiesInCell = table.activities[index];
                if (!Array.isArray(activitiesInCell) || activitiesInCell.length === 0) continue;

                const day = Math.floor(index / unitCount) + 1;
                const section = (index % unitCount) + 1;

                if (day < 1 || day > 7 || section < 1 || section > 12) continue;

                for (const act of activitiesInCell) {
                    if (!act) continue;

                    let name = firstNonEmpty(act.courseName, act.name);
                    if (!name) continue;

                    const teacher = extractTeacherFromCourse(act);
                    const position = extractPositionFromCourse(act);
                    const weeks = extractWeeksFromCourse(act);

                    courses.push(createCourseObject(name, teacher, position, day, section, section, weeks));
                }
            }
        }

        return courses;
    }

    function parseFromHtmlTableFallback() {
        const table = document.querySelector("#manualArrangeCourseTable");
        if (!table) return [];

        const bodyRows = table.querySelectorAll("tbody tr");
        const courses = [];

        bodyRows.forEach((row, rowIndex) => {
            const cells = row.querySelectorAll("td");
            if (cells.length < 8) return;

            const section = rowIndex + 1;

            for (let col = 1; col <= 7; col++) {
                const td = cells[col];
                if (!td) continue;

                const title = td.getAttribute("title") || "";
                if (!title.trim()) continue;

                const day = col;
                const parsed = parseTitleToCourses(title, day, section);
                courses.push(...parsed);
            }
        });

        return courses;
    }

    function extractPositionFromTitle(title) {
        const positionMatch = title.match(/\(([^(),]*)\)\s*$/);
        if (!positionMatch) return "";

        const potential = positionMatch[1].trim();
        // 排除掉是周次表达式的情况
        if (!/^\d+[-~]|^[单双]|^\d+$/.test(potential)) {
            return potential;
        }
        return "";
    }

    function supplementPositionFromHtml(courses) {
        const table = document.querySelector("#manualArrangeCourseTable");
        if (!table) return courses;

        const courseMap = {};
        for (const course of courses) {
            // 用课程名、教师、日期、时间作为 key
            const key = `${course.name}|${course.teacher}|${course.day}|${course.startSection}`;
            if (!courseMap[key]) {
                courseMap[key] = [];
            }
            courseMap[key].push(course);
        }

        const bodyRows = table.querySelectorAll("tbody tr");
        bodyRows.forEach((row, rowIndex) => {
            const cells = row.querySelectorAll("td");
            if (cells.length < 8) return;

            const section = rowIndex + 1;

            for (let col = 1; col <= 7; col++) {
                const td = cells[col];
                if (!td) continue;

                const title = td.getAttribute("title") || "";
                if (!title.trim()) continue;

                const day = col;
                const position = extractPositionFromTitle(title);

                // 从 title 提取课程信息并匹配
                const titleParts = title.split(";").map(p => p.trim()).filter(p => p && !p.startsWith("("));
                for (const part of titleParts) {
                    const { name, teacher } = parseCourseNameAndTeacher(part);
                    if (!name) continue;

                    const key = `${name}|${teacher}|${day}|${section}`;
                    if (courseMap[key]) {
                        for (const course of courseMap[key]) {
                            if (!course.position) {
                                course.position = position;
                            }
                        }
                    }
                }
            }
        });

        return courses;
    }

    function mergeContiguousSections(courses) {
        const normalized = (courses || [])
            .filter((c) => c && c.name && Number.isInteger(c.day) && Number.isInteger(c.startSection) && Number.isInteger(c.endSection))
            .map((c) => ({
                ...c,
                weeks: normalizeWeeks(c.weeks)
            }));

        normalized.sort((a, b) => {
            const ak = `${a.name}|${a.teacher}|${a.position}|${a.day}|${a.weeks.join(",")}`;
            const bk = `${b.name}|${b.teacher}|${b.position}|${b.day}|${b.weeks.join(",")}`;
            if (ak < bk) return -1;
            if (ak > bk) return 1;
            return a.startSection - b.startSection;
        });

        const merged = [];
        for (const item of normalized) {
            const prev = merged[merged.length - 1];
            const isContinuous = prev
                && prev.name === item.name
                && prev.teacher === item.teacher
                && prev.position === item.position
                && prev.day === item.day
                && prev.weeks.join(",") === item.weeks.join(",")
                && prev.endSection + 1 >= item.startSection;

            if (isContinuous) {
                prev.endSection = Math.max(prev.endSection, item.endSection);
            } else {
                merged.push({ ...item });
            }
        }

        return merged;
    }

    async function exportAllCourseData() {
        safeToast("开始解析教务课表...");
        console.log("[Exporter] 开始解析课表");

        let parsedCourses = parseFromCourseTableObjects();

        if (parsedCourses.length === 0) {
            console.warn("[Exporter] 未从 tableX.activities 取到数据，尝试 HTML 兜底解析");
            parsedCourses = parseFromHtmlTableFallback();
        } else {
            console.log(`[Exporter] 从 table.activities 获取 ${parsedCourses.length} 条课程，尝试补充位置信息...`);

            // 尝试从 HTML 补充位置信息
            parsedCourses = supplementPositionFromHtml(parsedCourses);
            console.log(`[Exporter] 补充位置后 ${parsedCourses.length} 条课程`);
        }

        parsedCourses = mergeContiguousSections(parsedCourses);

        if (parsedCourses.length === 0) {
            throw new Error("未在当前页面识别到可导出的课程数据，请确认已打开我的课表页面。");
        }

        console.log(`[Exporter] 解析完成，课程条目数: ${parsedCourses.length}`);
        console.log(`[Exporter] 样本课程:`, JSON.stringify(parsedCourses.slice(0, 2), null, 2));

        const presetTimeSlots = [
            {
                "number": 1,
                "startTime": "08:00",
                "endTime": "08:45"
            },
            {
                "number": 2,
                "startTime": "10:05",
                "endTime": "11:40"
            },
            {
                "number": 3,
                "startTime": "14:00",
                "endTime": "15:35"
            },
            {
                "number": 4,
                "startTime": "16:05",
                "endTime": "17:40"
            },
            {
                "number": 5,
                "startTime": "19:00",
                "endTime": "20:35"
            },
            {
                "number": 6,
                "startTime": "20:45",
                "endTime": "22:20"
            }
        ];

        await window.AndroidBridgePromise.saveImportedCourses(JSON.stringify(parsedCourses));
        await window.AndroidBridgePromise.savePresetTimeSlots(JSON.stringify(presetTimeSlots));

        safeToast(`导出成功，共 ${parsedCourses.length} 条课程`);
    }

    (async function run() {
        try {
            await exportAllCourseData();
        } catch (error) {
            console.error("[Exporter] 导出失败:", error);
            safeToast(`导出失败：${error.message}`);
        } finally {
            try {
                window.AndroidBridge && AndroidBridge.notifyTaskCompletion();
            } catch (e) {
                console.error("[Exporter] notifyTaskCompletion 调用失败:", e);
            }
        }
    })();
})();
