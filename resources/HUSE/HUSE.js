/**
 * 将周次字符串（如 "1-4,6,8-10"）解析为有序的周次数字数组。
 * 支持连续区间（如 "1-4"）和单个周次（如 "6"）的混合格式。
 * @param {string} weekStr - 原始周次字符串
 * @returns {number[]} 去重并升序排列的周次数组
 */
function parseWeeks(weekStr) {
    const weeks = [];
    const parts = weekStr.split(',');

    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-');
            for (let w = parseInt(start); w <= parseInt(end); w++) {
                if (!weeks.includes(w)) weeks.push(w);
            }
        } else {
            const w = parseInt(part);
            if (!isNaN(w) && !weeks.includes(w)) weeks.push(w);
        }
    }

    return weeks.sort((a, b) => a - b);
}

/**
 * 从教务系统返回的 HTML 文档中解析所有课程信息。
 * 遍历课表格 #timetable 中每个单元格，提取课程名、教师、教室及周次节次。
 * @param {Document} doc - 已解析的 HTML 文档对象
 * @returns {object[]} 课程对象数组，每项包含 day/name/teacher/position/weeks/startSection/endSection
 */
function extractCoursesFromDoc(doc) {
    const courses = [];
    const table = doc.getElementById('timetable');
    if (!table) throw new Error("未找到课表格元素（#timetable），请确认教务系统页面已正常加载。");

    const rows = table.getElementsByTagName('tr');
    // 跳过首行（表头）和末行（通常为空白行）
    for (let rowIdx = 1; rowIdx < rows.length - 1; rowIdx++) {
        const cells = rows[rowIdx].getElementsByTagName('td');

        for (let colIdx = 0; colIdx < cells.length; colIdx++) {
            const dayOfWeek = colIdx + 1; // 列索引对应星期几（1=周一）
            const cell = cells[colIdx];

            const contentDivs = cell.querySelectorAll('div.kbcontent');
            if (contentDivs.length === 0) continue;

            contentDivs.forEach(div => {
                const rawHtml = div.innerHTML;
                // 跳过空单元格
                if (!rawHtml.trim() || rawHtml === '&nbsp;') return;

                // 同一格内多门课以 10 个以上连字符分隔
                const blocks = rawHtml.split(/-{10,}\s*<br\s*\/?>/i);

                blocks.forEach(block => {
                    if (!block.trim()) return;

                    const tmp = document.createElement('div');
                    tmp.innerHTML = block;

                    const course = {
                        day: dayOfWeek,
                        isCustomTime: false
                    };

                    // 课程名称取第一个文本节点，fallback 到 innerText 首行
                    const firstNode = tmp.childNodes[0];
                    if (firstNode && firstNode.nodeType === Node.TEXT_NODE) {
                        course.name = firstNode.nodeValue.trim();
                    } else {
                        course.name = tmp.innerText.split('\n')[0].trim();
                    }

                    // 教师姓名
                    const teacherEl = tmp.querySelector('font[title="教师"]');
                    course.teacher = teacherEl ? teacherEl.innerText.trim() : "未知";

                    // 上课教室
                    const roomEl = tmp.querySelector('font[title="教室"]');
                    course.position = roomEl ? roomEl.innerText.trim() : "待定";

                    // 周次与节次：格式为 "X-Y(周)[A-B节]" 或仅 "X-Y(周)"
                    const timeEl = tmp.querySelector('font[title="周次(节次)"]');
                    if (!timeEl) return;

                    const timeText = timeEl.innerText.trim();
                    const fullMatch = timeText.match(/(.+?)\(周\)\[(\d+)-(\d+)节\]/);
                    if (fullMatch) {
                        course.weeks = parseWeeks(fullMatch[1]);
                        course.startSection = parseInt(fullMatch[2]);
                        course.endSection = parseInt(fullMatch[3]);
                    } else {
                        const weekOnlyMatch = timeText.match(/(.+?)\(周\)/);
                        if (weekOnlyMatch) {
                            // 节次信息缺失时，根据行索引推算默认节次
                            course.weeks = parseWeeks(weekOnlyMatch[1]);
                            course.startSection = rowIdx * 2 - 1;
                            course.endSection = rowIdx * 2;
                        } else {
                            return; // 无法识别的时间格式，跳过
                        }
                    }

                    if (course.name && course.weeks && course.weeks.length > 0) {
                        courses.push(course);
                    }
                });
            });
        }
    }

    return courses;
}

/**
 * 根据当前日期返回对应学期的作息时间表。
 * 5月1日至9月30日期间使用夏季作息，其余时间使用春秋冬季作息。
 * @returns {object[]} 节次时间数组，每项包含 number/startTime/endTime
 */
function getPresetTimeSlots() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    // 判断是否处于夏季作息期间（5月1日 ~ 9月30日）
    const isSummer = (month > 5) || (month === 5 && day >= 1) || (month < 10) && (month > 4);

    if (isSummer) {
        // 夏季作息
        return [
            { number: 1, startTime: "08:10", endTime: "08:55" },
            { number: 2, startTime: "09:05", endTime: "09:50" },
            { number: 3, startTime: "10:10", endTime: "10:55" },
            { number: 4, startTime: "11:05", endTime: "11:50" },
            { number: 5, startTime: "14:45", endTime: "15:30" },
            { number: 6, startTime: "15:40", endTime: "16:25" },
            { number: 7, startTime: "16:40", endTime: "17:25" },
            { number: 8, startTime: "17:35", endTime: "18:20" },
            { number: 9, startTime: "19:30", endTime: "20:15" },
            { number: 10, startTime: "20:25", endTime: "21:10" },
            { number: 11, startTime: "21:20", endTime: "22:05" }
        ];
    } else {
        // 春秋冬季作息
        return [
            { number: 1, startTime: "08:20", endTime: "09:05" },
            { number: 2, startTime: "09:05", endTime: "10:00" },
            { number: 3, startTime: "10:20", endTime: "11:05" },
            { number: 4, startTime: "11:15", endTime: "12:00" },
            { number: 5, startTime: "14:30", endTime: "15:15" },
            { number: 6, startTime: "15:25", endTime: "16:10" },
            { number: 7, startTime: "16:25", endTime: "17:10" },
            { number: 8, startTime: "17:20", endTime: "18:05" },
            { number: 9, startTime: "19:10", endTime: "19:55" },
            { number: 10, startTime: "20:05", endTime: "20:50" },
            { number: 11, startTime: "21:00", endTime: "21:45" }
        ];
    }
}

/**
 * 从教学周历页面推断学期开学日期（YYYY-MM-DD）。
 * 解析策略：
 * 1) 优先读取第 1 周对应的周一日期；
 * 2) 若未命中，则在周历表中收集全部日期并取最小值兜底。
 * @returns {Promise<string|null>} 开学日期字符串；无法解析时返回 null
 */
async function getStartDate() {
    // 请求教学周历页面（包含每周日期映射）
    const response = await fetch('/jsxsd/jxzl/jxzl_query', { method: 'GET' });
    const htmlText = await response.text();
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');

    // 周历主表格，日期信息存放在单元格 title 属性中
    const table = doc.querySelector("#kbtable");
    if (!table) {
        console.log("未找到周历表格 #kbtable");
        return null;
    }

    // 将“YYYY年M月D日”转为“YYYY-MM-DD”
    const parseCNDate = (text) => {
        const m = String(text).match(/(\d{4})年(\d{1,2})月(\d{1,2})/);
        if (!m) return null;
        const [, y, mo, d] = m;
        return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    };

    // 优先取“第1周 + 星期一”
    const week1Row = Array.from(table.querySelectorAll("tr")).find((tr) => {
        const first = tr.cells?.[0]?.textContent?.trim();
        return first === "1";
    });

    let start = null;
    if (week1Row && week1Row.cells[1]) {
        start = parseCNDate(week1Row.cells[1].getAttribute("title"));
    }

    // 兜底：从所有日期里取最小值
    if (!start) {
        const allDates = Array.from(table.querySelectorAll("td[title]"))
            .map((td) => parseCNDate(td.getAttribute("title")))
            .filter(Boolean)
            .sort();
        start = allDates[0] || null;
    }

    console.log("开学日期：", start || "未找到");
    return start;
}
/**
 * 返回全局课表基础配置（单节课时长与课间休息时长）。
 * @returns {Promise<{ semesterStartDate: string|null, defaultClassDuration: number, defaultBreakDuration: number }>}
 */
async function getCourseConfig() {
    const semesterStartDate = await getStartDate();
    return {
        semesterStartDate: semesterStartDate,
        defaultClassDuration: 45,
        defaultBreakDuration: 10
    };
}

/**
 * 课表导入主流程。
 * 依次完成：发起请求 → 解析 HTML → 提取课程 → 保存配置/作息/课程 → 通知完成。
 * 在浏览器调试环境中仅打印结果，不调用 AndroidBridge。
 */
async function runImportFlow() {
    const isApp = typeof window.AndroidBridgePromise !== 'undefined';
    const hasToast = typeof window.AndroidBridge !== 'undefined';

    try {
        if (hasToast) {
            AndroidBridge.showToast("正在拉取课表，请稍候...");
        } else {
            console.log("[HUSE] 开始请求课表页面...");
        }

        const response = await fetch('/jsxsd/xskb/xskb_list.do', { method: 'GET' });
        const htmlText = await response.text();
        const doc = new DOMParser().parseFromString(htmlText, 'text/html');

        // 读取学期列表（当前仅用于记录，实际取最新学期）
        const selectEl = doc.getElementById('xnxq01id');
        const semesters = [];
        const semesterValues = [];
        let defaultIndex = 0;

        if (selectEl) {
            selectEl.querySelectorAll('option').forEach((opt, idx) => {
                semesters.push(opt.innerText.trim());
                semesterValues.push(opt.value);
                if (opt.hasAttribute('selected')) defaultIndex = idx;
            });
        }
        // 始终选取列表末尾的最新学期
        defaultIndex = semesters.length - 1;
        console.log(`[HUSE] 共找到 ${semesters.length} 个学期，当前使用：${semesters[defaultIndex] || '未知'}`);

        const courses = extractCoursesFromDoc(doc);

        if (courses.length === 0) {
            const msg = "未解析到任何课程，当前学期可能暂无排课。";
            console.warn("[HUSE] " + msg);
            if (isApp) {
                await window.AndroidBridgePromise.showAlert("提示", msg, "好的");
            } else {
                alert(msg);
            }
            return;
        }

        console.log(`[HUSE] 成功解析 ${courses.length} 门课程。`);

        const config = await getCourseConfig();
        const timeSlots = getPresetTimeSlots();

        // 浏览器调试环境：输出结果后退出，不执行 APP 存储逻辑
        if (!isApp) {
            console.log("[HUSE] 课表基础配置：", config);
            console.log("[HUSE] 作息时间表：", timeSlots);
            console.log("[HUSE] 课程列表：", courses);
            alert(`解析完成！共获取 ${courses.length} 门课程及作息时间，详情见控制台（F12）。`);
            return;
        }

        // APP 环境：保存课表配置与作息时间
        const configSaved = await window.AndroidBridgePromise.saveCourseConfig(JSON.stringify(config));
        const slotsSaved = await window.AndroidBridgePromise.savePresetTimeSlots(JSON.stringify(timeSlots));
        if (!configSaved || !slotsSaved) {
            // 时间配置保存失败不强制中断，继续尝试导入课程
            console.warn("[HUSE] 课表时间配置保存失败，将继续尝试导入课程。");
            AndroidBridge.showToast("时间配置保存失败，继续导入课程...");
        }

        // APP 环境：保存课程数据
        const courseSaved = await window.AndroidBridgePromise.saveImportedCourses(JSON.stringify(courses));
        if (!courseSaved) {
            console.error("[HUSE] 课程数据保存失败。");
            AndroidBridge.showToast("课程保存失败，请重试！");
            return;
        }

        console.log(`[HUSE] 导入完成，共写入 ${courses.length} 门课程。`);
        AndroidBridge.showToast(`成功导入 ${courses.length} 门课程及作息时间！`);
        AndroidBridge.notifyTaskCompletion();

    } catch (err) {
        console.error("[HUSE] 导入流程发生异常：", err);
        if (hasToast) {
            AndroidBridge.showToast("导入失败：" + err.message);
        } else {
            alert("导入失败：" + err.message);
        }
    }
}

runImportFlow();