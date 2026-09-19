# 进度摘要

## Current State（当前状态）

- Last Updated：2026-09-14。已按用户授权完成 feat-067 的搜索防抖生命周期修正，再回到 feat-063 完成 Focus 同步/隔离验收；最终完整开发门禁、生产定向对照与收尾启动基线均通过。
- 当前 feature 数量只维护在根列表的 `featuresNumber` 中；归档与交接约定沿用 [Harness 维护说明](docs/harness/README.md)，本轮未达归档阈值。
- feat-063、feat-067 均为 done；feat-064/065/066/068 保持 not-started。唯一推荐下一步为 feat-064：核对 About 照片资产交付与缺失回退的完整验收后开始。
- 常规启动读取本节、任务索引及所选任务记录；[session-handoff.md](session-handoff.md) 仅供相邻会话恢复。会话开始前的既有范围外未提交改动均保留。


## 2026-09-13 — Harness 归档、计数与交接整理（未登记 feature）

- 范围：使用 harness-creator 与 skill-creator，按用户要求维护状态文档、归档说明和技能的交接规则；不登记 feature，不修改应用代码、依赖、构建或运行配置。
- 计数：新增 `featuresNumber`，始终等于根 `features.length`，包含全部状态、不含归档；数组新增或移入/移出时同步维护，只改状态时不变。进度不另记 feature 总数或 done 汇总；不以计数生成新 ID。
- 归档：取消字节数限制和逐任务备份。先看 `featuresNumber`，未超过阈值直接跳过；超过后才检查是否满足 done 超过 40 的既有条件。触发时一次归档全部已完成条目与完整进度，未完成任务及必要证据留在根文件，并同步更新计数字段。
- 交接：每轮任务结束重写 session-handoff，只服务相邻两次会话；不追加、不归档、不保留旧版，也不将完整旧交接搬到进度中继续追踪。已移除旧交接副本及其目录/哈希引用；长期事实和验证证据继续由任务进度承载。
- 历史整理：此前提前归档的任务及进度已经回到根文件，零散归档、旧路径与失效预算说明已清理；现只保留 feature 与进度的首批历史。任务状态、依赖、排序及应用验收结果保持，feat-062 同步移除长期保存交接的旧约束。
- 技能：记忆说明原先把交接归入持久记忆并要求建立索引；已直接修改 `/home/dadalv/.agents/skills/harness-creator/` 下的 `SKILL.md`、`references/memory-persistence-pattern.md`、`templates/session-handoff.md` 和 `templates/agents.md`，明确每轮重写且不归档，长期记录写入进度或项目文档。技能元数据保持，正文不引入本项目的计数字段或归档阈值；工作区外的写入已通过权限确认执行成功。
- 文档核对：`python3 -` exit 0，计数字段与根数组一致；任务状态、依赖、排序及未涉及业务文件保持，feat-062 仅调整交接约束和维护说明。52 个本地链接及任务锚点可解析，旧交接归档没有残留引用；技能改动与准备稿一致，元数据未变。`git diff --check` exit 0，`git status --short` 已核对。迁移临时文件已清理，不作为恢复依赖。
- 未运行：`./init.sh`、`npm run check`、`npm run check:full`、`npm run test:compose-smoke`、应用测试/构建及 Harness/Skill 验证脚本；沿用用户明确的纯文档维护约定。下方应用结果均为此前任务的历史证据，不代表本轮运行。
- 唯一下一步：开始 feat-060，核对首批归档中的 feat-035 及根列表验收后，再运行代码会话的启动门禁。

## 当前批次任务索引

| 任务 | 状态 | 完整进度 |
| --- | --- | --- |
| feat-063 | done | [Study 开发序列同步与隔离](#feat-063) |
| feat-067 | done | [搜索开发序列超时](#feat-067) |
| feat-064 | not-started | [About 照片展示与交付待修复](#feat-064) |
| feat-068 | not-started | [高开销开发浏览器诊断待复核](#feat-068) |
| feat-061 | done | [计划澄清与执行事实一致性](#feat-061) |
| feat-060 | done | [Study 本地日历与午夜边界](#feat-060) |
| feat-065 | not-started | [首页搜索组件门禁待复核](#feat-065) |
| feat-066 | not-started | [默认并发上传门禁待复核](#feat-066) |
| feat-059 | done | [Post 同时间分页与稳定排序](#feat-059) |
| feat-058 | done | [Agent 入口身份重验](#feat-058) |
| feat-057 | done | [搜索错误反馈与文章展示投影](#feat-057) |
| feat-056 | done | [聊天 SSE 慢查询串行与关闭生命周期](#feat-056) |
| feat-055 | done | [生活字段共享约束与旧记录兼容](#feat-055) |
| feat-054 | done | [计划控件名称与键盘操作](#feat-054) |
| feat-062 | done | [首次状态与历史分离](#feat-062) |

以下保留各任务实际的改动、失败与验收证据；已清除被撤销的零散归档记录和旧预算说明。当时的推荐下一步只描述历史情况，当前唯一下一步以上方总览及交接为准；重复摘要由本索引替代。

<a id="feat-063"></a>

## 2026-09-13 — feat-063：Study 开发序列同步与隔离

- 范围：只处理 Study 浏览器启动反馈与失败后的用例隔离；保留原有未提交改动，不扩入 feat-064/065/066。归档 feat-035 已满足依赖。
- 历史失败：feat-055 的两次开发完整门禁均为同样两项 Study 失败；定向及生产模式通过不消除此记录，原始命令和现象保留在 [feat-055](#feat-055)。
- 启动基线：`VITEST_MAX_WORKERS=1 ./init.sh` exit 0，类型、lint、79 文件/682 项 Node/组件通过；继续隔离尚未复核的默认并发问题。
- 首次诊断：`DEBUG=pw:webserver E2E_APP_MODE=development E2E_SOFTWARE_WEBGL=true NEXT_PUBLIC_AGENT_ENTRY_THEME=default ./scripts/run-node22.sh npm run test:e2e -- --trace=on` 在未修改原 Study 操作/断言时运行，但全程 trace 与软件 WebGL 下出现明显内存压力（7.8GB 内存仅余 366MB available、2GB swap 用满）。About Router 初始化、Chat 时钟 hydration、1280px 宿主表单、跨标签身份及长生活字段等范围外用例失败；在到达 Focus 原用例前发送 SIGINT 停止，exit 130，19 passed/5 failed/1 interrupted/16 did not run，不能作为完整序列或 Study 结论。测试服务/容器已自动关闭。
- 常规配置原用例诊断：`DEBUG=pw:webserver E2E_APP_MODE=development ./scripts/run-node22.sh npm run test:e2e`，只增加临时 HTTP/数据库状态日志，保持原操作、断言与超时；最终报告 31 passed/10 failed（24.5m）。权限边界切换后原 process 句柄失效，退出码未回收，不能写为通过。两项 Focus 仍以原方式失败：首项 `getByText(/专注中 ·/)` 5000ms，第二项等待按钮和 `/api/study/start` 30000ms。原搜索失败由 feat-067 复核，其余范围外失败随高开销对照保留到 feat-068。
- 实际链条：首项 t=19324ms 发出 start，请求响应未被浏览器收到时 UI 断言已失败，清理钩子看到 start 按钮可见、running 不可见、DB idle；后一用例未发出 start，页面却显示 running、按钮不存在，DB 为 running（startedAt=`2026-09-13T14:14:42.012Z`，deadline 为 25 分钟后）。同期开发表现为 presence HTTP 200 需 13.7 秒，其中 Next 12.9 秒、application 795ms；浏览器 responseStart 约 13.8/14.0 秒，伴随后续 running 倒计时 hydration 差异。证据确认迟到写入跨越用例边界、共享用户且无失败清理；未收到首项 start 响应，不能虚构该响应的状态或精确编译耗时，也不把内存压力下的全部延迟归因于某个产品函数。
- 修正：`tests/e2e/support/study.ts` 每次建立独立 User/Room 并真实登录，finally 先关闭页面再事务删除 User/Room，利用既有 FK 级联清理认证和 Focus 数据；迟到写入只涉及已删除的独立用户。start 等待 HTTP 200/running/sessionKey 再做默认 UI 断言；stop 校验请求 key/HTTP 200，并等待真实 GET 回读 idle/同 key。原子结算、sessionKey、到期恢复和应用 UI/服务代码保持。
- 清理负向对照：临时移除 helper 的 User/Room 删除后，`./scripts/run-node22.sh npm run test:e2e -- tests/e2e/authenticated.spec.ts --grep 'Focus 用例失败后'` exit 1，1 failed/1 passed；真实启动 running 后回调抛错，下一次使用检查旧用户 `Expected: 0 / Received: 1`。测试结束立即恢复删除，隔离数据库自动清理。
- 首次修正回归：`./scripts/run-node22.sh npm run typecheck` exit 0；`./scripts/run-node22.sh npm run test:e2e -- tests/e2e/authenticated.spec.ts --grep 'starts and stops a focus session|reconciles one expired focus session|Focus 用例失败后'` exit 1，2 failed/2 passed：到期恢复通过，start/stop 与失败清理在辅助函数读取 stop `response.json()` 时达 30000ms，页面快照已显示 idle 和完成记录。已移除这个额外等待，改由应用实际消费的 GET 业务回读确认状态；遥测也不再等待 `response.finished()`，避免诊断自身成为同步门禁。
- 最终定向开发回归：原三项 grep 命令重跑 exit 0，4/4（含 setup，50.8s），业务用例耗时 16.8s/8.9s/7.9s。真实 start 响应均为 200/running，冷路径 responseStart 4214ms，其余 115–154ms；stop 200 后 GET 回读 idle、同 key，Session 恰一条。清理回归确认旧 User/Session/FocusState/FocusSession/Room 均无残留，下一独立用户从 idle 开始。
- 完整验收：`NODE_OPTIONS=--max-old-space-size=1536 VITEST_MAX_WORKERS=1 E2E_APP_MODE=development ./scripts/run-node22.sh npm run check:full` 的标准门禁通过（79 文件/682 项、生产构建、覆盖率 51.63/45.43/56.06/52.25），真实 PostgreSQL 29 文件/110 项通过。开发浏览器中出现 `Server is approaching the used memory threshold, restarting...`，320px 和 Session 到期入口用例失败。已核对锁定 Next 的 `server/lib/utils.js`：开发 heap 超过 limit 的 80% 会请求重启；1536MB 约 1.2GB 即触发，说明该临时验证上限过低。此轮最终浏览器结果见下一条；随后仅重跑浏览器层并将进程上限改为 4096MB；不修改应用配置、全局超时或重启机制。
- 1536MB 完整命令最终 exit 1：开发 Playwright 为 38 passed/4 failed（11.9m），Focus 三项全部通过（26.9s/12.5s/9.6s）；start HTTP 200，冷路径 responseStart 4305ms、其余 180–245ms，stop 的真实 GET 回读与数据库计数一致。范围外失败为 320px 清理请求 `ECONNREFUSED`、Session 到期入口超时、发帖导航落入 `chrome-error://chromewebdata/`、搜索 90000ms 超时；前三项附近有三次自动重启日志，搜索不能仅凭同时发生就归因于重启。
- 浏览器环境复核：`NODE_OPTIONS=--max-old-space-size=4096 E2E_APP_MODE=development ./scripts/run-node22.sh npm run test:e2e`。仅增加本次测试进程的堆上限，不关闭 Next 内存监测、不改 Web/Worker 配置，不重跑已通过且代码未变的标准/PostgreSQL 层。
- 4096MB 完整开发复核：`NODE_OPTIONS=--max-old-space-size=4096 E2E_APP_MODE=development ./scripts/run-node22.sh npm run test:e2e` exit 1，41 passed/1 failed（8.1m），无内存阈值重启；三个 Focus 用例 11.2s/5.8s/6.9s 通过，冷 start responseStart 1621ms，后续 48–103ms，HTTP 200 与业务/数据库断言一致。唯一剩余为原搜索用例 90000ms 超时，finally 的 `page.unroute` 因页面关闭而报错；快照停留在输入了查询前缀、仍展示未筛选首页的位置。该用例在改动前完整开发诊断也失败，保持 feat-067 独立处理。
- 阶段性阻塞：当时完整开发 Playwright 全绿的验收未满足，feat-063 暂记 blocked，未用三项 Focus 或生产模式成功替代这一条件。随后用户明确授权先处理 feat-067；生产对照结果和完整开发恢复证据分别见本项下文与 feat-067。

- 生产模式定向对照：`NODE_OPTIONS=--max-old-space-size=4096 E2E_APP_MODE=production ./scripts/run-node22.sh npm run test:e2e -- tests/e2e/authenticated.spec.ts --grep 'starts and stops a focus session|reconciles one expired focus session|Focus 用例失败后'` exit 0，4/4（含 setup，1.5 分钟含生产构建）；三项分别 5.5s/4.1s/8.7s，start responseStart 28–36ms，stop 与后续 GET 也为 HTTP 200，业务与数据库断言均通过。

- feat-067 修正搜索防抖后，本项完整开发验收恢复：`NODE_OPTIONS=--max-old-space-size=4096 VITEST_MAX_WORKERS=1 E2E_APP_MODE=development ./scripts/run-node22.sh npm run check:full` 单次 exit 0，79/685、生产构建、覆盖率 51.58/45.39/56.06/52.25、真实 PostgreSQL 29/110、42/42 开发 Playwright（5.0m）。三项 Focus 11.2s/4.6s/7.4s，真实 start/stop/GET 与 Session/清理断言全部通过；冷 start responseStart 3403ms，后续 36–102ms。未修改 Focus 产品状态机；随后完成下述最终生产对照与工件收尾。

- 最终生产对照：`NODE_OPTIONS=--max-old-space-size=4096 E2E_APP_MODE=production ./scripts/run-node22.sh npm run test:e2e -- tests/e2e/authenticated.spec.ts --grep 'starts and stops a focus session|reconciles one expired focus session|Focus 用例失败后|搜索失败保留已有文章|同毫秒文章'` exit 0，6/6（含 setup，1.2m 含生产构建）；三项 Focus 4.3s/3.0s/7.4s，搜索恢复 3.2s、分页 5.3s。Focus start responseStart 18–31ms，start/stop/GET 全部 HTTP 200；状态、结算、失败清理和搜索契约均通过。已核对并仅恢复生产构建自动生成的 next-env.d.ts 类型路径，保留原开发类型引用；未改 Next 配置。
- 收尾启动：清理诊断快照和测试报告后，`VITEST_MAX_WORKERS=1 ./init.sh` 在此前已验证的正常权限边界 exit 0；Prisma generate、资产校验、类型、lint、79 文件/685 项通过（Vitest 39.66s）。没有重复执行已通过且实现未再变更的完整应用门禁。
- 验收结论：真实证据确认了请求尚未完成就开始 UI 断言，以及共享用户的迟到写入跨用例污染；HTTP/业务同步和独立数据生命周期已修正。开发完整序列、真实 PostgreSQL、失败清理与最终生产对照全部满足根验收，feat-067 完成后本项返回并标为 done；没有确认需要新增 QAM-07 ID 的产品状态机缺陷。
- 验证边界：本轮最终完整门禁使用单 Vitest worker 和 4096MB Node 堆上限；默认并发问题仍由 feat-065/066 复核，全程 trace/软件 WebGL 及其他开发诊断仍由 feat-068 保留。未另跑 `npm run test:compose-smoke`、Compose 构建/重启、`npm run dev` 健康端点、生日主题专用矩阵或实体设备；本轮没有修改这些启动/部署/资产接缝，生产对照仅声明上述五条业务旅程与 setup 的 6/6。
- 工件、结构核验与当前下一步见 [feat-067 收尾](#feat-067)；两项原始失败证据均留在各自进度中。

<a id="feat-067"></a>

## 2026-09-14 — feat-067：搜索开发序列超时

- 2026-09-14 用户授权：先修复本项中完整开发门禁唯一剩余的搜索用例超时，再回到 feat-063；归档依赖 feat-040 为 done，已将本项设为 in-progress。
- 启动权限对照：`VITEST_MAX_WORKERS=1 ./init.sh` 在受限沙箱 exit 1，79 文件中 76 passed/3 failed、682 项中 675 passed/7 failed；Study 三个进程时区、one-shot Worker 时区和三种 Agent 主题子进程均为 `SyntaxError: Unexpected end of JSON input`（stdout 为空）。按权限型复核要求，以相同 Node.js 22.23.2/npm 10.9.8 在获准正常边界重跑原命令 exit 0，79/682 全通过，类型/lint/资产校验通过；未改代码掩盖沙箱差异。
- 搜索定向诊断：`NODE_OPTIONS=--max-old-space-size=4096 E2E_APP_MODE=development ./scripts/run-node22.sh npm run test:e2e -- tests/e2e/authenticated.spec.ts --grep '搜索失败保留已有文章' --trace=on` 在沙箱 exit 1，`Could not find a working container runtime strategy`、Web Server 未启动；获准正常边界重跑 exit 0、2/2（44.1s，搜索 19.9s）。只加入临时请求/导航日志及保证数据库清理的 finally，不改搜索操作/断言/超时。首次输入后 Clear search 按钮存在，300ms 后发出 RSC 导航，随后真实搜索 HTTP 200；500/401/network/retry 和文章详情全部到达。定向成功不能关闭完整序列失败，继续复核路由预热后的首次输入。
- 范围收敛：按用户明确授权，本项只处理完整开发门禁中唯一剩余的搜索超时。原高开销 trace/软件 WebGL 的完整对照验收和历史失败独立移入 feat-068；不把常规配置成功当作原问题关闭。新增依赖 feat-057 已核对为 done。

- 中断恢复：带轻量搜索日志的 `NODE_OPTIONS=--max-old-space-size=4096 E2E_APP_MODE=development ./scripts/run-node22.sh npm run test:e2e` 在用户中断前观察到前 17 项通过；恢复后原进程句柄无效、临时日志不存在，运行中的 Docker 容器只剩原 `xoxo-meridian-postgres`，未回收最终报告/退出码，不计为完整门禁通过。仓库实现与进度保留。随后用同一隔离服务中的冷/热两次独立浏览器会话诊断搜索差异，新日志暂写入 test-results/feat-067-diagnostic，最终已清理；收尾检查全部容器时另发现并移除了中断留下的已退出测试容器，详情见本项收尾。

- 冷/热对照：上述定向 grep 在同一服务中执行两次独立浏览器会话（临时重复用例，随后移除），exit 0、3/3；冷搜索 18.4s，预热后首次输入 1382ms 时清除按钮已出现，1684ms 发出 RSC，1765ms URL 更新、1885ms 搜索 HTTP 200，错误恢复及详情也通过。单纯预热未复现，仍需完整开发序列证据，不据此猜测 hydration 或修改产品。

- 完整开发对照：`NODE_OPTIONS=--max-old-space-size=4096 E2E_APP_MODE=development ./scripts/run-node22.sh npm run test:e2e` exit 0、42/42（5.6m，无 skip/retry），搜索 7.5s。轻量日志显示输入后 1025ms 时清除按钮存在，1332ms 发出 RSC，1501ms URL 更新，1516ms 发出搜索、5367ms 收到 200（responseStart 1829ms）；500/401/网络失败、键盘恢复、位置和详情均通过。三个 Focus 用例 12.8s/5.6s/7.3s，通过真实 start/stop/GET 与数据库断言，冷 start responseStart 3084ms、后续 42–96ms。本轮无 Next 内存阈值重启；并未确认历史搜索超时的产品根因，资源压力归因继续留在 feat-068，不声称高开销配置已恢复。
- 阶段性收敛：移除临时事件日志和冷/热重复用例；搜索操作通过 Playwright step 区分输入/URL 与 HTTP/列表，先验证真实首次查询结果已渲染再切入错误保留，不新增重试、mock 成功数据或放宽超时。finally 关闭本页，在外层 finally 中事务清理作者/文章并断开数据库，不依赖页面关闭后的 unroute。此时尚未改 SearchInput、HomeTimelineBoard、API 或产品模型，也未确认产品根因；后续复现与 QAM-05-009 的登记见下文。
- 中间类型检查：`./scripts/run-node22.sh npm run typecheck` exit 2，原因是误用 .ts 后缀保存在 test-results 的两份源码快照进入 tsconfig 的全局 TypeScript include，报相对 support 模块缺失及派生隐式 any；已把本轮快照改为 .txt，不改 tsconfig/应用代码排除错误。随后最终标准门禁通过：类型、lint、79/682、生产构建、覆盖率 51.58/45.39/56.06/52.25。

- 关闭页面的失败清理对照：临时复制搜索用例，在真实页面/作者/两篇文章/锚点已建立后主动关闭页面并抛出原始失败，`./scripts/run-node22.sh npm run test:e2e -- tests/e2e/authenticated.spec.ts --grep '搜索清理失败回归'` 如预期 exit 1、1 failed/1 passed（21.8s）。报告唯一错误为注入的“搜索清理回归：页面关闭后的原始失败”，未被 unroute/target-closed 遮蔽；真实 PostgreSQL 回查 User/Post/AtlasElement 为 `[0,0,0]`。临时故障用例和计数日志已立即移除，随后执行最终正常完整门禁。

- 最终门禁首轮实际结果：`NODE_OPTIONS=--max-old-space-size=4096 VITEST_MAX_WORKERS=1 E2E_APP_MODE=development ./scripts/run-node22.sh npm run check:full` exit 1；标准门禁 79/682、生产构建、覆盖率 51.58/45.39/56.06/52.25、真实 PostgreSQL 29/110（98.90s）通过，Playwright 为 39 passed/3 failed（7.9m）。除两项搜索 90000ms 外，跨标签用例有 `Performance.measure: ChatIndexPage cannot have a negative time stamp`，后者保留到 feat-068，未过滤 observed.errors。中途仅查看最后几项通过日志而漏看前面的跨标签失败，导致“前 30 项通过”的口头进度不准确，以此完整结果纠正。
- 搜索准确失败点：新 step 中 fill 15ms、Clear search 可见断言 2ms 通过，随后 waitForURL 和 waitForResponse 均达到原 90000ms；快照仍为输入前缀及未过滤的三篇文章。尚未到达本轮新增的 response.json/结果断言，故不是额外读取响应体造成的等待。清理没有再以 unroute 错误遮蔽原始超时。后续同时间分页用例也在等待搜索响应时超时。
- 产品根因 QAM-05-009：SearchInput 在 onChange 创建防抖定时器，而挂载 effect 只有清理、没有创建。首次挂载期间输入已更新本地 value 后，开发 StrictMode 的 effect 重放清除定时器却无处重建，留下“有输入/清除按钮、无导航”的状态。按用户授权的产品修正范围实施；使用 xoxo-qam-05-content-timeline-review 技能核对 QAM 边界/报告，不把纯审查技能的限制误作新的实施授权要求。
- 稳定回归：新组件用例在 StrictMode 首次挂载期间只派发一次原生 input，验证输入值/清除按钮与最终导航；旧实现 `./scripts/run-node22.sh npm test -- tests/component/search-input.test.tsx` 最终为 1 failed/4 passed，唯一失败为导航调用数 0。前期 fireEvent/act 版本有 act 提示，最终改为原生 input.value setter/事件且异步 act 完整等待后无此提示。最初新增的清空/卸载用例混用 user-event 与假时钟造成三项 5000ms 测试超时；已改为受控时钟下一次输入/点击事件，未改应用超时、关闭断言或保留待决异步任务。
- 最小产品修正：pending draft 驱动 effect 同时创建和清理 300ms 定时器，重放时恢复未提交查询；输入/清空仍立即取消旧 timer，清空立即导航 /home，外部 q 仍以 key 更新本地草稿。未改搜索参数、API、可见性、展示投影或数据库。`VITEST_MAX_WORKERS=1 ./scripts/run-node22.sh npm test -- tests/component/search-input.test.tsx tests/component/home-timeline-board-search.test.tsx tests/server/search-input.test.ts` exit 0，3 文件/23 项通过（含新 StrictMode、清空、卸载回归）；继续真实浏览器验收。

- 产品修正后的真实开发浏览器：`NODE_OPTIONS=--max-old-space-size=4096 E2E_APP_MODE=development ./scripts/run-node22.sh npm run test:e2e -- tests/e2e/authenticated.spec.ts --grep '搜索失败保留已有文章|同毫秒文章'` exit 0、3/3（39.1s，搜索恢复 14.2s、分页 5.4s）。两条旅程均通过真实 URL/HTTP/渲染与查询结果；仍保留错误注入、键盘恢复、两地位置、53 条分页完整性。已提交的查询会清除待提交标志，避免后续 effect 恢复重复提交同一草稿；随后重跑相关组件与最终完整门禁。

- 产品修正后的最终完整门禁：上述 `NODE_OPTIONS=--max-old-space-size=4096 VITEST_MAX_WORKERS=1 E2E_APP_MODE=development ./scripts/run-node22.sh npm run check:full` 单次 exit 0；79 文件/685 项 Node/组件、Next.js 16.3.3 production build、覆盖率 51.58/45.39/56.06/52.25、29 文件/110 项真实 PostgreSQL（100.77s）、42/42 开发 Playwright（5.0m，无 skip/retry）。搜索恢复 7.4s、同时间分页 5.9s；五个相关业务旅程均通过，原 500/401/network、键盘与位置/分页断言保留。此次跨标签步骤也通过，未以此取消 feat-068 的历史 Performance.measure 及高开销诊断记录。随后最终生产对照与收尾也已通过。

- 最终代码生产搜索/Focus 对照 6/6；收尾 `VITEST_MAX_WORKERS=1 ./init.sh` exit 0、79/685，原始生产命令与耗时见 [feat-063](#feat-063)。
- 质量结论：[QAM-05 报告](docs/optimization/qam-05-content-timeline-quality-review.md) 将 009 设为 resolved，保留旧输入无导航及红/绿、完整开发和生产证据；恢复既有搜索契约，评分仍为 80、Score L3、Gate/Final L2，其余五个 P2 保持开放。[模块总览](docs/optimization/module-quality-overview.md) 同步追加本轮历史，均分 86.2、开放 QAM P2 为 28。
- 工件清理：移除本轮 coverage、test-results、playwright-report 及其中全部诊断日志、源码快照、HTML/trace 和临时用例；长期失败证据留在本项及 feat-063/068。中断容器 `312a0130344b` 的只读检查在沙箱因 Docker socket `permission denied` exit 1，获准正常边界重跑 exit 0；Created 为 `2026-09-13T16:52:32.042779493Z`，Testcontainers 标签、postgres:16-alpine、`POSTGRES_DB=xoxo_meridian_e2e` 与本轮中断诊断吻合。`docker rm -v 312a0130344b` exit 0，随后确认容器及匿名卷均消失；仅保留原 `xoxo-meridian-postgres`（healthy）。没有本轮 E2E 临时目录、测试服务进程或 Testcontainers 网络/卷残留，未创建测试镜像。
- 状态收尾：使用 harness-creator 的证据与交接规则同步根状态，feat-067 done 后返回 feat-063 并完成其验收；重写 session-handoff，仅保留下一会话需要的摘要和恢复命令。本轮未达到批量归档阈值，原验收、失败记录与未决约定完整保留。源码最终验证后只有文档/状态整理，不再触发应用门禁。
- 最终结构核验：`python3 -` exit 0，JSON、全局唯一 ID、跨归档依赖、合法状态及全部根任务的进度索引一致；180 个本地链接/Markdown 锚点可解析，QAM-05 的 80/100、Gate/Final L2、五个开放 P2 与 resolved 009 一致，总览均分 86.2/开放 P2 28 算术正确，评分历史只追加。本轮中断恢复哈希对照仅九个授权范围内文件变化，无丢失或新增范围外文件，归档、next-env 及既有用户改动保持；Focus helper/原用例修正早于该恢复快照，搜索段之外的 E2E 内容与恢复快照一致。`git diff --check` exit 0，`git status --short` 已核对；报告/临时目录为空、开发类型引用存在，清理与重启路径均满足退出要求。
- 唯一推荐下一步：feat-064，核对 About 照片来源、干净环境交付与缺失回退验收；feat-065/066/068 保持独立未开始。

<a id="feat-068"></a>

## 2026-09-14 — feat-068：高开销开发浏览器诊断待复核

- 拆分依据：feat-067 的搜索阻塞处理已获用户授权；原登记中尚未确认的高开销配置诊断单独保留，原描述、三项验收及以下历史失败均完整迁入。本项为 not-started，依赖 feat-040。
- 来源：feat-063 的全程 trace + 软件 WebGL 诊断。原命令为 `DEBUG=pw:webserver E2E_APP_MODE=development E2E_SOFTWARE_WEBGL=true NEXT_PUBLIC_AGENT_ENTRY_THEME=default ./scripts/run-node22.sh npm run test:e2e -- --trace=on`；38.4 分钟时主动 SIGINT、exit 130，19 passed/5 failed/1 interrupted/16 did not run。Focus 原用例尚未运行，不能据此解释 feat-063。
- 失败摘要：匿名 About 的 `observed.errors` 包含 `Internal Next.js error: Router action dispatched before initialization.`；Chat 冷启动的 `observed.errors` 包含 `LifePanel` 世界时钟 SSR/浏览器文字 hydration mismatch；1280px 宿主表单、跨标签身份恢复、Agent 长生活字段用例超时，计划澄清用例被中断。同期 7.8GB 内存 available 366MB，2GB swap 用满，停止测试后 available 恢复到 3.6GB。
- 状态：独立 not-started，不改产品、不改默认配置与全局超时。尚未证明各现象共因或归因于单一 QAM；需在该项对照诊断配置、资源和产品状态。常规配置的后续结果只作为对照，不直接关闭本项。
- 常规对照：`DEBUG=pw:webserver E2E_APP_MODE=development ./scripts/run-node22.sh npm run test:e2e` 最终 31 passed/10 failed（24.5m，原 process 句柄在权限边界切换后失效，未回收退出码）。其中两项 Focus 归 feat-063；其余为跨标签身份、首页照片、计划键盘、档案隐私、发帖、聊天发送/快照和搜索。后半段 available 408MB、2GB swap 用满；About/Chat 冷启动、三个视口和长生活字段在此轮通过，不能把所有现象简单归因于 trace 或软件 WebGL。
- 额外证据：feat-067 产品修正前的 `NODE_OPTIONS=--max-old-space-size=4096 VITEST_MAX_WORKERS=1 E2E_APP_MODE=development ./scripts/run-node22.sh npm run check:full` exit 1、开发 Playwright 39 passed/3 failed；跨标签身份交互完成后，`observed.errors` 收到 `Performance.measure: ChatIndexPage cannot have a negative time stamp`。另两项无搜索请求已由 QAM-05-009 修复；性能计时错误仍独立保留。本轮最终常规开发 42/42 不证明高开销配置或该错误的全部触发条件已经修正，本项保持 not-started。

<a id="feat-064"></a>

## 2026-09-13 — feat-064：About 照片展示与交付待修复

- 状态：not-started，无前置依赖。当前仅登记并列为下一步，没有实施资产或回退修改。
- 来源与证据：feat-057 生产完整门禁虽为 37/37，仍输出 `/images/about/oo.jpg`、`/images/about/xx.jpg` 的 invalid-image；两文件在当前环境不存在，也未被 Git 跟踪，均命中 `images/` 忽略规则。原始命令和检查结果见 [feat-057](#feat-057)，Agent 入口用例通过不证明照片有效。
- 下一会话按根 feature 的完整验收核对资产授权/可交付性、缺失时布局与可访问描述，并执行 production 浏览器实际请求及可见结果验证。

<a id="feat-061"></a>

## 2026-09-13 — feat-061：计划澄清与执行事实一致性

- 范围与依赖：归档 `feat-019` 为 done，仅将 feat-061 标为 in-progress。使用 `xoxo-qam-08-agent-runtime-review` 核对报告标准、QAM-08 和跨模块边界；旧 `docs/optimization/agent-runtime-review.md` 当前不存在，按既有报告说明保留现状，不恢复历史删除。
- 启动基线：`VITEST_MAX_WORKERS=1 ./init.sh` exit 0，Node 22.23.2/npm 10.9.8、Prisma generate、资产校验、类型、lint、79 文件/679 项通过。沿用上轮单 worker 和 production 浏览器配置；feat-065/066 的默认并发问题不扩入本项。
- 修复前 Node：`VITEST_MAX_WORKERS=1 ./scripts/run-node22.sh npm run test:unit -- tests/agent/plan-repair.test.ts tests/agent/task-claim.test.ts` exit 1，2 failed/11 passed；纯澄清输出和真实 Runtime 编排均收到“之前那个已经帮你取消了。要不要再新安排一次？告诉我具体什么时候发，我马上排上。”，不满足澄清断言。Runtime 已确认 Planner 调用两次、fallback 原因为 `one_shot_promise_without_create` 且零 Tool 执行。
- 修复前 PostgreSQL：`VITEST_MAX_WORKERS=1 ./scripts/run-node22.sh npm run test:integration -- tests/integration/agent-plan-validation.integration.test.ts` exit 1，1 failed/12 passed。有效 Job 的整行、ToolCall=[]、tool Step=[] 和 fallback 事件先通过断言，最终 Message 却仍确认旧任务已取消，直接复现数据库事实与回复冲突；使用真实 PostgreSQL Testcontainer，未访问开发库。
- 改动：`agent/plan-repair.ts` 的缺少一次性创建分支改为“请再确认这次一次性任务的具体日期、时间和时区。”，并注明 Tool loop 前不能从已丢弃计划推断写入完成。Scheduler、Tool 集合、执行顺序和后处理机制保持既有实现。
- 回归：Node 覆盖重复无效 Planner、无取消/创建/更新完成声明、合法 runOnce 自动修复和普通零 Tool 对话；PostgreSQL 覆盖原 Job 整行不变、零 ToolCall/Step、fallback 和单条真实 Message。Playwright 使用仅绑定 loopback 的确定性 LLM HTTP 服务驱动真实 Provider/Runtime/数据库，检查实时澄清、有效计划卡片和刷新一致性，结束关闭服务并删除隔离房间。
- 修复后定向 Node：`VITEST_MAX_WORKERS=1 ./scripts/run-node22.sh npm run test:unit -- tests/agent/plan-repair.test.ts tests/agent/task-claim.test.ts tests/agent/plan-validator.test.ts` exit 0，3 文件/22 项通过。
- 最终完整门禁：`VITEST_MAX_WORKERS=1 E2E_APP_MODE=production E2E_SOFTWARE_WEBGL=true NEXT_PUBLIC_AGENT_ENTRY_THEME=default ./scripts/run-node22.sh npm run check:full` 单次 exit 0，79 文件/682 项 Node/组件、生产构建、覆盖率 statements 51.58%、branches 45.39%、functions 56.06%、lines 52.25%，29 文件/110 项真实 PostgreSQL（含计划校验 13/13）、41/41 production Playwright（4.8 分钟）。本次计划澄清浏览器用例 3.2 秒通过，实时/刷新保持原计划有效；合法计划修复、普通零 Tool 对话、Durable Step、审批/预算与请求者/Memory 回归均保持。
- 收尾基线：仅恢复构建生成的 `next-env.d.ts` 两处类型路径后，`VITEST_MAX_WORKERS=1 ./init.sh` exit 0，Prisma generate、资产、类型、lint、79 文件/682 项通过。
- 报告与状态：QAM-08-007 提升为 E3 并标为 resolved，数据流与状态一致性 +1，QAM-08 82→83，Score L3、Gate/Final L2；其他四项 P2 仍开放。按统一报告标准同步总览的 QAM-08 行、组合均分/问题数及历史，不改其他模块结论；feat-061 标为 done，计数字段与根数组一致且未超过归档阈值，直接跳过归档，重写相邻会话交接。
- 验证边界：未另跑默认 worker、默认开发模式完整门禁、`npm run test:compose-smoke`、`npm run dev` 健康端点、Compose 镜像构建/重启、生日主题浏览器矩阵或实体设备；本项未修改这些接缝。沿用已验证的单 worker/production 配置，不关闭 feat-063/065/066；浏览器仍有 8 条既有 About 缺图诊断，继续由 feat-064 独立处理。
- 清理与结构核验：测试报告、临时验证日志/快照与草稿已清理，恢复不依赖临时文件；本轮 PostgreSQL/Ryuk 容器及 E2E 临时卷已释放，未创建独立镜像/网络，既有两个数据库容器保持。JSON、全局 ID/依赖、计数字段、报告十维合计/问题表/本地引用通过；`git diff --check` exit 0，`git status --short` 已核对，既有用户改动保留。
- 唯一下一步：开始 feat-063，先核对根验收和归档 feat-035，再复核开发模式 Study 浏览器超时与用例残留，不提前扩入其他验证问题。

<a id="feat-060"></a>

## 2026-09-13 — feat-060：Study 本地日历与午夜边界

- 范围与前置：按 priorityRank 选择 feat-060，核对归档 feat-035 为 done，只将本项改为 in-progress；使用 QAM-07 复核技能核验定义与证据，用户的修复请求同时授权业务、报告和状态改动。已读本地 Next.js ORM/数据读取指南。未修改 Focus 状态机、Goal 排序、schema/迁移、依赖或部署配置。
- 根因：本地日历日期与绝对时长是两种不同的量。原 streak 从 now 用服务器 `Date.setDate` 递减，秋季重复计日、春季跳过日期；成员查询把当前 offset 拼到午夜，DST 当天偏移一小时，且缺少次日排除边界。
- 修正：`lib/study-calendar.ts` 抽离不依赖 Prisma/服务的纯日历统计，保留 `lib/study.ts` 原统计导出兼容调用方；streak 在目标时区日期键上用 UTC 日历递减。`getStudyDateWindow` 使用复用的 Intl formatter，在有界时间区间内按日期键定位该本地日期出现的第一毫秒，求本日、次日及八天回看的完整日期起点；成员查询使用 `[todayStartUtc, tomorrowStartUtc)`。继续按 `startedAt` 本地日期、周日周界和 completed focus 统计；本人及伙伴统一使用查看者传入的时区，保留原有近期窗口，不扩大为无限历史 streak。
- 启动权限复核：沙箱 `./init.sh` exit 1，78 文件中 2 failed/76 passed、4 failed/649 passed；`agent-entry-build-config` 三项和 `scheduled-job-one-shot` 一项因子进程空 stdout 得到 `SyntaxError: Unexpected end of JSON input`。依 AGENTS.md 在正常权限边界以同一 Node 22 重跑原命令 exit 0：78 文件/653 项、Prisma generate、类型和 lint 全通过。沙箱 `docker ps --format '{{.Names}}'` 原始结果为 socket `permission denied`，获准正常边界原命令 exit 0，仅有既有 `xoxo-meridian-postgres`。
- Node 修复前：`./scripts/run-node22.sh npm run test:unit -- tests/lib/study.test.ts` exit 1，7 passed/5 failed（12 项）；纽约/伦敦回退日两天记录得到 streakDays=3，春季后周一午夜应连续三天却为两天，UTC 子进程亦复现。新增固定场景覆盖纽约/伦敦春秋切换、上海普通周日、跨午夜 startedAt 归属、周日周界、休息/取消过滤和今天缺记录归零；另加入报告原始的纽约两条记录场景，以及 UTC/洛杉矶/上海三个独立进程 TZ 对照。
- PostgreSQL 修复前：`./scripts/run-node22.sh npm run test:integration -- tests/integration/study-calendar.integration.test.ts` 前两次均 exit 1、0/5，分别为新夹具误写 `prisma.profile.createMany` 和缺少 `UserProfile.city/country`，属于测试实现错误，已修正，不计作产品失败证据。第三次同命令 exit 1、0/5：春季本人/伙伴应为 60 分钟却为 70，秋季为 0；插入下一天边界记录后上海错误计为 105 而非 60，并复现 streak 春秋错误。
- PostgreSQL 修复后：`./scripts/run-node22.sh npm run test:integration -- tests/integration/study-calendar.integration.test.ts tests/integration/study-focus-transitions.integration.test.ts` exit 0、2 文件/15 项。补充八天回看完整日期后，`TZ=UTC ./scripts/run-node22.sh npm run test:integration -- tests/integration/study-calendar.integration.test.ts tests/integration/study-focus-transitions.integration.test.ts` exit 0、2 文件/16 项；除 DST/午夜、下一日排除、非成员隔离与查看者时区外，跨回退周的窗口首日也完整计入，原有 Focus 事务、并发、重放、故障回滚和到期恢复 10 项全部通过。
- 组件与类型修正：`./scripts/run-node22.sh npm run test:component -- tests/component/study-calendar-stats.test.tsx` 首次 exit 1、0/1，初始概览仍处于 opacity=0 的入场动画；改为等待可见状态。`./scripts/run-node22.sh npm run typecheck` 首次 exit 2、TS2769，Testing Library 的 getByRole 不支持 `exact` 参数，已移除。修复后定向 `./scripts/run-node22.sh npm test -- tests/lib/study.test.ts tests/lib/study-productization.test.ts tests/lib/study-transitions.test.ts tests/server/study-api.test.ts tests/server/study-product-api.test.ts tests/server/study-dashboard.test.ts tests/server/study-page-productized.test.ts tests/server/chat-left-rail-study-status.test.ts tests/component/study-calendar-stats.test.tsx` 为 8 文件/64 项 Node 通过、1 项组件失败：刷新后的开始按钮仍处于入场动画；同样改为等待可见状态，组件原命令最终 exit 0、1/1。MSW 只替代 HTTP 边界，验证初始概览/伙伴均 1h，停止成功经实际 GET 刷新后均 45m，连续天数也同步；不冒充真实数据库或浏览器时钟证据。
- 午夜重复的补充证据：直接运行 Node 22 的 `CronDate(new Date("2026-11-02T04:30:00Z"), "America/Havana").setStartOfDay()` 探针得到 `2026-11-01T05:00:00Z`；Intl 对照证明 `04:00Z` 已是本地 Nov 1 的第一个 00:00，`05:00Z` 是第二个。最终以本地日期首次出现的时刻为日界，补哈瓦那春季跳过午夜和秋季重复午夜，避免把复用库本身当作正确性的证据。未新增依赖。
- 最终定向：`./scripts/run-node22.sh npm test -- tests/lib/study.test.ts tests/component/study-calendar-stats.test.tsx` exit 0、2 文件/27 项；`TZ=UTC ./scripts/run-node22.sh npm run test:integration -- tests/integration/study-calendar.integration.test.ts tests/integration/study-focus-transitions.integration.test.ts` exit 0、2 文件/18 项（8 项日历读取、10 项 Focus）；类型检查原命令最终 exit 0。
- 完整门禁前两次：相同 `E2E_APP_MODE=production E2E_SOFTWARE_WEBGL=true NEXT_PUBLIC_AGENT_ENTRY_THEME=default ./scripts/run-node22.sh npm run check:full` 均 exit 1，停在 quick，分别为 79 文件中 1 failed/78 passed、1 failed/665 passed。首次唯一失败是既有首页搜索组件的 `IntersectionObserver is not defined`（`lib/useScrollReveal.ts:15`）；未修改其源码，`./scripts/run-node22.sh npm run test:component -- tests/component/home-timeline-board-search.test.tsx tests/component/study-calendar-stats.test.tsx` 对照 exit 0、2/16。该门禁不稳定现象独立登记 feat-065，不推断为产品缺陷、不合并修复；根列表计数字段随新增项同步。第二次唯一失败是新增跨进程时区测试 `Test timed out in 5000ms`：同一测试串行启动三次子进程并加载整个 Study 服务依赖。最终把纯日期逻辑抽离成独立模块、每个 TZ 单独用例，只加载被测纯模块；保留默认超时。
- 第三次完整门禁：同一原 production 命令 exit 1，quick 为 2 failed/77 passed 文件、2 failed/677 passed 项；本次 Study 新增场景全部通过。两项既有上传 Route 测试 `tests/server/atlas-storage-routes.test.ts:78` 与 `tests/server/home-board-routes.test.ts:76` 均 `Test timed out in 5000ms`；未修改两文件，`./scripts/run-node22.sh npm run test:unit -- tests/server/atlas-storage-routes.test.ts tests/server/home-board-routes.test.ts` 定向 exit 0、2/14、396ms。独立登记 feat-066；当前环境报告 32 CPU，锁定 Vitest 源码确认支持 `VITEST_MAX_WORKERS`，但定向成功不证明默认并发故障已解决。
- 第四次完整门禁：`VITEST_MAX_WORKERS=4 E2E_APP_MODE=production E2E_SOFTWARE_WEBGL=true NEXT_PUBLIC_AGENT_ENTRY_THEME=default ./scripts/run-node22.sh npm run check:full` exit 1。快速测试和覆盖率测试均 79 文件/679 项通过，生产构建通过，覆盖率 50.50/45.07/55.09/51.07；集成为 2 passed/27 failed 文件、5 passed/104 failed 项，出现 `Unique constraint failed (slug)`、PostgreSQL `40P01 deadlock detected` 等。核对锁定 Vitest 的解析顺序后确认环境变量覆盖了 integration 的 `maxWorkers: 1`，让原本共享测试库的文件并发执行、互相 reset。这是本轮验证配置错误，不是产品数据库回归；该轮不作为集成通过证据，未修改业务或仓库验证配置。
- 最终完整门禁：`VITEST_MAX_WORKERS=1 E2E_APP_MODE=production E2E_SOFTWARE_WEBGL=true NEXT_PUBLIC_AGENT_ENTRY_THEME=default ./scripts/run-node22.sh npm run check:full` 单次 exit 0：79 文件/679 项 Node/组件、Next.js 16.3.3 生产构建、覆盖率 statements/branches/functions/lines 为 50.50/45.07/55.09/51.07、29 文件/109 项真实 PostgreSQL、40/40 production Playwright（4.1 分钟，无 skip）。使用单 worker 保持集成串行隔离，保留全部检查和默认单项超时；默认并发问题由 feat-065/066 跟踪，默认开发模式 Study 序列仍由 feat-063 跟踪。
- 浏览器与诊断：既有 Focus 启动/停止（7.0s）、离开后到期重访/刷新（2.8s）及 Study 私密载荷边界均通过。本轮没有对浏览器/服务端时钟模拟 DST，日期边界由固定时间 Node/真实 PostgreSQL 及组件读取呈现组合验收。About 仍输出六条既有 `The requested resource isn't a valid image`（feat-064）；该非阻断诊断不证明照片正常加载。
- 启动收尾：生产构建只将 next-env.d.ts 的两处 `.next/dev/types/` 引用改为 `.next/types/`；核对旧类型文件仍存在后仅恢复本轮生成差异。`VITEST_MAX_WORKERS=1 ./init.sh` exit 0：Prisma generate、类型、lint、79 文件/679 项全部通过，当前工作树可直接建立启动基线。
- 未运行边界：默认开发模式 `./scripts/run-node22.sh npm run check:full`、`npm run test:compose-smoke`、`npm run dev` 健康端点、Docker 镜像构建、生日主题矩阵或实体设备未另跑；本轮未改对应部署、启动或资产接缝，不声明这些范围通过。
- 质量：[QAM-07 报告](docs/optimization/qam-07-study-quality-review.md) 关闭 003；数据一致性和健壮性各 +1，85→87，Score L3、Gate/Final L2，Goal 排序 004 保持开放；[模块总览](docs/optimization/module-quality-overview.md) 同步均分 86.1、开放 QAM P2 为 29。新增的 feat-065/066 只登记验证稳定性现象，不合并实现或推断新的 QAM 产品缺陷。
- 清理：`rm -r -- coverage test-results playwright-report` exit 0；E2E 临时数据库/服务已关闭，Docker 检查没有本轮 Testcontainers 容器或标签卷残留，已有 XOXO PostgreSQL 以及本轮未创建的另一 baseline Compose PostgreSQL/network 均保留。未构建测试镜像；本轮日志、类型快照与文件摘要在记录证据后移除，不作为恢复依赖。
- 收尾核验：JSON、全量 ID 唯一性、跨归档依赖、状态、评分算术、Markdown 链接/行号与 diff/status 核验通过；根列表计数字段与新增独立任务同步，不超过 40，直接跳过归档。范围外既有文件 SHA-256 保持，三份状态记录同步并重写交接。
- 唯一下一步：开始 feat-061（QAM-08-007，计划澄清回复误称旧任务已取消），启动前只提取归档 feat-019 核对依赖。

<a id="feat-065"></a>

## 2026-09-13 — feat-065：首页搜索组件门禁待复核

- 来源：feat-060 首次 production 完整命令在 quick 阶段 exit 1，既有 `home-timeline-board-search` 的首个搜索响应场景抛 `ReferenceError: IntersectionObserver is not defined`，栈为 `lib/useScrollReveal.ts:15`。
- 原代码对照：`./scripts/run-node22.sh npm run test:component -- tests/component/home-timeline-board-search.test.tsx tests/component/study-calendar-stats.test.tsx` exit 0、2 文件/16 项。本轮未修改 Home 组件、测试或 hook，也没有用单次对照成功消除原始失败；完整命令、实际结果与后续受控并发对照见 [feat-060](#feat-060)。
- 状态：独立 not-started。下一次实施本项时先定位 effect、组件卸载与全局替身恢复顺序；不提前推断产品浏览器错误。该登记不改变唯一推荐下一步 feat-061。

<a id="feat-066"></a>

## 2026-09-13 — feat-066：默认并发上传门禁待复核

- 来源：feat-060 第三次默认 worker production 完整命令在 quick 阶段 exit 1，`atlas-storage-routes` 和 `home-board-routes` 两个上传场景均 `Test timed out in 5000ms`；其余 677 项通过。两文件本轮未修改，失败位置在动态导入 Route 附近。
- 原代码对照：`./scripts/run-node22.sh npm run test:unit -- tests/server/atlas-storage-routes.test.ts tests/server/home-board-routes.test.ts` exit 0、2 文件/14 项、396ms；当前环境报告 32 CPU。完整命令和后续并发对照见 [feat-060](#feat-060)。
- 验证配置边界：锁定 Vitest 的 `VITEST_MAX_WORKERS` 会覆盖 integration 的 `maxWorkers: 1`；全局设为 4 导致共享数据库并发 reset/唯一键冲突和 deadlock，不可作为有效的集成配置。降低单元测试资源并发时仍须保留集成串行约定。
- 状态：独立 not-started，尚未定位默认 worker 的资源竞争或实际服务故障。该登记不改变唯一推荐下一步 feat-061。

<a id="feat-059"></a>

## 2026-09-13 — feat-059：Post 同时间分页与稳定排序

- 范围：核对归档依赖 feat-033 为 done，只推进 feat-059。使用 QAM-05 复核技能及 harness-creator 状态核验，按本地 Next.js Route Handler、ORM 读取和客户端边界指南实施；未改 Post 写入、可见性、schema/index、依赖、部署、搜索错误反馈或空间保存。
- 根因与修正：时间戳不能唯一定位记录；原 `publishedAt < cursor` 会排除同毫秒未返回的文章。首页/API 共用 `(publishedAt DESC,id DESC)`，Timeline 依同一键反向呈现。版本1 Base64url cursor 经同域 Zod 校验再做复合比较，独立嵌入 AND，保持搜索 OR 与成员过滤；锚点删除后仍可按原值续读。旧时间字符串与畸形 cursor 返回可观察400；页长限定正整数，默认50/最多100，满页到尾允许下一次空页。
- 启动：`./init.sh` 初始 exit0，77文件/623项；production 自动把 next-env.d.ts 的两处 `.next/dev/types` 改为 `.next/types`，只恢复本轮生成变化后，收尾 `./init.sh` 再次 exit0、78/653。
- 数据库负向对照：`./scripts/run-node22.sh npm run test:integration -- tests/integration/post-pagination.integration.test.ts` 旧实现 exit1、0/4；59条可见记录（57条同毫秒）以50条分页只返回51条，原文 `expected ... to have a length of 59 but got 51`；首页和删除锚点测试也观察到错误的同时间顺序。
- 数据库修复验证：`./scripts/run-node22.sh npm run test:integration -- tests/integration/post-pagination.integration.test.ts tests/integration/post-timeline-projection.integration.test.ts tests/integration/post-visibility.integration.test.ts` exit0、3文件/6项。1/17/50三种页长重复读取列表/搜索均恰好59条；覆盖 title/content 不区分大小写搜索、首页最新50条、成员/孤儿隐藏、type/author组合和删除游标末项后的续读。
- 组件负向对照：`./scripts/run-node22.sh npm run test:component -- tests/component/timeline-order.test.tsx` 旧实现 exit1、0/1，标题顺序 `older,c,a,b,newer`。修复后 `./scripts/run-node22.sh npm run test:component -- tests/component/timeline-order.test.tsx tests/component/home-timeline-board-search.test.tsx` exit0、2/16；含 Date/字符串时间、用户/Agent混合、重排/重渲染与原数组保持。
- Route负向对照：`./scripts/run-node22.sh npm run test:unit -- tests/server/posts-api.test.ts` 旧实现 exit1、27 failed/13 passed；旧/畸形cursor未返回400，limit=0还触发空末项访问500，同毫秒cursor相同。修复后 `./scripts/run-node22.sh npm run test:unit -- tests/server/posts-api.test.ts tests/server/home-timeline-board-search.test.ts tests/server/timeline-empty-message.test.ts` 首轮 exit1、1 failed/45 passed：空cursor同时产生min/regex两项issues，测试错误地要求恰好一项；改为核对cursor路径的可观察错误后原命令exit0、3/46。再补空白/控制字符ID拒绝，最终Post Route42项由完整门禁全部验证。
- 类型/lint：`./scripts/run-node22.sh npm run typecheck` 首轮exit2，两处TS2550（测试使用的toReversed不在当前lib声明）；改为复制数组后reverse，未改TS配置，原命令exit0。`./scripts/run-node22.sh npm exec eslint -- lib/post-timeline.ts lib/post-pagination.ts app/api/posts/route.ts app/home/page.tsx components/blog/Timeline.tsx tests/server/posts-api.test.ts tests/integration/post-pagination.integration.test.ts tests/component/timeline-order.test.tsx tests/e2e/authenticated.spec.ts` exit0；完整门禁和收尾init再次覆盖全量类型/lint。
- 完整门禁：`E2E_APP_MODE=production E2E_SOFTWARE_WEBGL=true NEXT_PUBLIC_AGENT_ENTRY_THEME=default ./scripts/run-node22.sh npm run check:full` 单次exit0：78文件/653项Vitest、Next.js 16.3.3生产构建、覆盖率statements/branches/functions/lines为50.43/45.03/55.02/50.99、28文件/101项真实PostgreSQL、40/40 Playwright（3.5分钟，无跳过）。
- 浏览器：新增[同毫秒旅程](tests/e2e/authenticated.spec.ts#L1280)在上述完整命令中首次即通过（3.5秒）；真实PostgreSQL乱序写入53条同毫秒Post，首页/刷新/搜索保持最新50条的反向顺序，17条分页的真实API返回全部53条且无重复，旧时间cursor为400。未mock服务端排序/搜索，finally删除本例Post及级联锚点；已有浏览器用例正文完整保留。
- 非阻断诊断：生产完整门禁有六条既有 `The requested resource isn't a valid image`（`/images/about/oo.jpg`、`/images/about/xx.jpg`各三次，feat-064）；没有closed-controller/unhandledRejection。测试用mock供应商和终端颜色提示不影响断言。
- 未运行：默认开发模式 `./scripts/run-node22.sh npm run check:full`，沿既有交接采用生产完整门禁，feat-063的开发Study序列问题保持；`npm run test:compose-smoke`、`npm run dev`健康端点、生日主题专用矩阵、Docker镜像及实体设备未另跑，本轮未改对应启动/资产接缝，不声明这些边界已验收。
- 质量：[QAM-05报告](docs/optimization/qam-05-content-timeline-quality-review.md)关闭003，数据一致性/健壮性/验证可信度各+1，77→80；Score L3、Gate/Final仍L2，其余五个P2保持。[总览](docs/optimization/module-quality-overview.md)同步组合均分85.9与开放P2为30。
- 清理与保留：核对后 `rm -r -- coverage test-results playwright-report` exit0；测试数据库、E2E临时目录、容器/网络/卷自动清理，Docker仅原健康PostgreSQL/Compose资源。既有Post API和E2E正文保留；首次Python正文提取校验因新增区段边界多保留一空行而失败，修正提取后哈希一致，未改旧测试。全仓库未涉及文件哈希保持；本轮临时日志/快照/草稿收尾删除，不作为恢复依赖。
- 收尾核验：首次Python链接扫描误将`javascript:...`安全示例当作文件；排除协议目标后139个本地链接/行号通过。任务字段/依赖、归档完整性、评分算术通过；Harness结构100/100，`git diff --check`/`git status --short`通过。
- 唯一下一步：按P2排名开始feat-060（QAM-07-003，学习连续天数与伙伴今日分钟时区边界），启动时核对归档依赖feat-035。

<a id="feat-058"></a>

## 2026-09-13 — feat-058：Agent 入口身份重验

- 范围：归档依赖 feat-031/040 均为 done。使用 QAM-10 复核技能及 harness-creator 状态核验，按本地 Next.js usePathname/客户端数据读取指南实现；不改 Session/Cookie、认证 API、Chat、Scene、GLB/主题、依赖或部署配置。
- 修正：Chat 路由卸载独立认证显示状态，返回须新 200；非 Chat 保留模型缓存，focus/visibility/BFCache 恢复重验。成功 logout 发同标签 Event 与跨标签 storage 通知，只存随机标识；先隐藏，再查服务器。100ms 合并事件，AbortController/generation 使旧请求失效；非 200/网络失败隐藏，下次事件可恢复，卸载清理定时器/监听/请求，无轮询。
- 启动：`./init.sh` exit 0，77 文件/607 项，Prisma generate、资产、类型/lint 和快速基线通过；恢复本轮 production 构建自动改写的 next-env.d.ts 两个类型目录后，收尾 `./init.sh` 再次 exit 0、77/623。
- 回归：`./scripts/run-node22.sh npm run test:component -- tests/component/agent-entry-gate.test.tsx` 旧 Gate exit 1、14 failed/10 passed；Chat 返回误挂载、focus/visibility/logout 不重验等均有直接失败。修复后连同 `tests/component/agent-entry.test.tsx` 为 34/34；补重验 500/断网恢复后同定向命令为 36/36（Gate 26、DOM 10）。覆盖 401/403、迟到 200、合并事件、无轮询、Strict Mode、存储不可用和取消清理。
- 类型/lint：`./scripts/run-node22.sh npm run typecheck` 两轮 exit 0；`./scripts/run-node22.sh npm exec eslint -- components/agent-entry/AgentEntryGate.tsx lib/session-logout.ts app/me/MeForm.tsx tests/component/agent-entry-gate.test.tsx tests/e2e/agent-entry-authenticated.spec.ts` 两轮 exit 0。最终完整门禁再次覆盖全量类型/lint。
- 浏览器命令：`E2E_SOFTWARE_WEBGL=true ./scripts/run-node22.sh npm run test:e2e -- tests/e2e/agent-entry-authenticated.spec.ts --grep '跨标签退出|真实 Session 到期'`。用真实第二位用户 API 登录隔离第一位用户 fixture；实际 UI logout/login、PostgreSQL Session.expiresAt、旧 WebGL context 与模型请求验收。
- 开发浏览器前七轮 exit1：场景句柄跨文档、原生 focus 被覆盖、channel 配置层级、登录选择器/受控表单同步及 Chat 冷导航逐步暴露；各轮原始错误、通过/失败数与修正完整保存在 [QAM-10 调试记录](docs/optimization/qam-10-agent-entry-quality-review.md)。第八轮 exit0、3/3（1.4分钟），跨标签52.5秒/到期10.1秒；原页面单次GLB、旧context释放和原生focus/401/200均通过。
- 焦点证据：独立 Chromium 对照证明 headless shell 不发原生 focus，完整 Chromium 须在导航后取消 Playwright 强制聚焦；当前断言真实 hasFocus=false→true，事件 isTrusted=true，无 JS 派发或 mock Session。对照过程见 QAM-10 报告。
- 验证安排：开发定向用例先预热所需路由，并在退出页面准备完成后才获取待观察场景，避免首次开发路由装配使旧句柄失效；两个主题生产矩阵均已通过。About 图片缺失诊断仍属 feat-064；未把 Three.Clock 库弃用提示或这些已知图片诊断并入实现。
- 完整门禁：`E2E_APP_MODE=production E2E_SOFTWARE_WEBGL=true NEXT_PUBLIC_AGENT_ENTRY_THEME=default ./scripts/run-node22.sh npm run check:full` 单次 exit 0：77 文件/623 项 Vitest、production build、覆盖率 statements/branches/functions/lines 为 50.16/44.69/54.71/50.77、27 文件/97 项 PostgreSQL、39/39 Playwright；其中包含默认主题入口全部 18 项（含 setup/public），跨标签与到期用例 14.1/4.2 秒。
- 生日主题：`./scripts/run-node22.sh npm run test:e2e:agent-entry:production:birthday` 单次 exit 0、18/18（2.6 分钟），跨标签/到期为 13.2/3.9 秒；default 的全部 18 项已在完整门禁运行，无重复矩阵。两主题均由 production 启动器反转运行时主题，仍只请求构建模型；CSP/外联、五类故障、静止帧、Canvas/缓存及键盘/触摸/布局全部通过。
- 未运行：默认开发模式 `./scripts/run-node22.sh npm run check:full`，依既有交接采用生产完整门禁，本轮开发只验收新增旅程，feat-063 保持；`npm run test:compose-smoke`、Docker image build/config 和实体设备未运行，未改这些接缝，不能把浏览器通过当作 image/GPU/软键盘/safe-area 验证。完整生产与生日命令各有六条既有 About invalid-image 诊断（feat-064），无 closed-controller/unhandledRejection；开发最后一轮清理阶段有服务端 Response 401，实际断言均通过。
- 质量：[QAM-10 报告](docs/optimization/qam-10-agent-entry-quality-review.md)关闭 QAM-10-003，数据状态/健壮性各 +2，84→88；两主题浏览器证据已补齐，QAM-10-005 的镜像部分仍开放，Gate/Final=L2。其余四个 P2 保持，已同步[总览](docs/optimization/module-quality-overview.md)，组合均分85.6、开放QAM P2为31。
- 清理：coverage、test-results、playwright-report 已删除；首次 `rm -rf coverage test-results playwright-report` 被执行策略拒绝且未运行，核对三个实际目录后 `rm -r -- coverage test-results playwright-report` exit 0。测试数据库/网络/卷及 E2E 临时目录自动清理，Docker 只剩原健康 PostgreSQL 与原 Compose 资源；本轮 /tmp 日志/草稿/快照收尾删除，不保留失败诊断工件。
- 收尾核验：58 个未涉及既有文件哈希保持，既有 Agent Entry E2E 用例正文完整保留；新增 worker 级 channel 与新用例未改既有断言。全量字段/依赖一致；草稿链接检查首轮发现 session-logout.ts 引用第26行越界，改为第25行后通过。最终任务字段/依赖、96个本地链接/行号、十维/总览算术通过；Harness结构100/100，`git diff --check`与status已核验。
- 唯一下一步：按 P2 排名开始 feat-059（QAM-05-003，同时间 Post 分页遗漏与排序），启动时核对归档依赖 feat-033。

<a id="feat-057"></a>

## 2026-09-13 — feat-057：搜索错误反馈与文章展示投影

- 范围：归档依赖 feat-033/048 均为 done，只实施 feat-057；使用 QAM-05 技能复核报告，harness-creator 核验状态。按本地 Next.js Route Handler/数据读取指南实现；保持 Post 写入、搜索范围、排序/cursor、schema/迁移、依赖与部署配置。
- 修正：`lib/post-timeline.ts` 定义首页/API 共用的最小 Post/author select；仅提供作者公开身份和 city/country/timezone，旧记录沿用逐字段快照优先 fallback，成员可见性保持。`HomeTimelineBoard` 检查 response.ok 与 posts 数组；401/500、网络、JSON/载荷失败显示可访问错误并保留最近成功结果，只有成功空集合显示无匹配；键盘可重试。成功/失败回写均检查各自 AbortSignal，切换、清空或卸载后的迟到响应被忽略。
- 启动：首次 `./init.sh` exit 0（77 文件/593 项）；完整门禁后只恢复本轮构建改写、启动时干净的 next-env.d.ts，再次 `./init.sh` exit 0（77/607），类型、lint 与快速基线均通过。
- 组件负向对照：`./scripts/run-node22.sh npm run test:component -- tests/component/home-timeline-board-search.test.tsx` 在旧实现 exit 1、12 failed/3 passed；错误路径找不到 alert，迟到成功/失败使新结果退回 Initial post。修复后同命令 exit 0、15/15。使用真实 Timeline/PostCard 和 MSW；覆盖首次/已有结果下的 401、500、断网、无效 JSON、缺失/null posts、空集合后的失败、键盘重试/清空、传输无法取消的迟到响应及卸载取消。
- 数据库负向对照：`./scripts/run-node22.sh npm run test:integration -- tests/integration/post-timeline-projection.integration.test.ts` 旧实现 exit 1、0/1，首页/API 结果深比较失败，搜索缺少 author.profile。修复后 `./scripts/run-node22.sh npm run test:integration -- tests/integration/post-timeline-projection.integration.test.ts tests/integration/post-visibility.integration.test.ts tests/integration/home-board-authorization.integration.test.ts` exit 0、3/3。真实 PostgreSQL 验证最小字段、快照/fallback、无作者/无档案、成员/非成员及孤儿语义；不以 Prisma mock 代替查询授权。
- Server：`./scripts/run-node22.sh npm run test:unit -- tests/server/posts-api.test.ts tests/server/home-timeline-board-search.test.ts` exit 0、2 文件/16 项；确认 HTTP 200 空集合、401/500 保持区分，空首页搜索中不误报无内容。`./scripts/run-node22.sh npm run typecheck` 与九个变更文件定向 ESLint 均 exit 0；最终完整门禁再次覆盖全量类型/lint。
- 开发浏览器：`./scripts/run-node22.sh npm run test:e2e -- tests/e2e/authenticated.spec.ts --grep '搜索失败保留已有文章'` 首轮 exit 1、1 passed/1 failed；getByRole('alert') 同时命中搜索提示与 `__next-route-announcer__`，原始失败为 strict mode violation。仅把测试查询限定到 main 后，同命令 exit 0、2/2（26.9 秒，含 setup）。真实 Next.js/PostgreSQL/Chromium 搜索两篇文章，注入 500/401/断网后仍显示两篇；键盘重试使用真实 API 恢复并进入原文章详情，Tokyo fallback/London 快照保持。401 注入只验证搜索反馈，不替代 Session 失效验证。
- 完整门禁：`E2E_APP_MODE=production ./scripts/run-node22.sh npm run check:full` 单次 exit 0：77 文件/607 项 Vitest、Next.js 16.3.3 production build、覆盖率 statements/branches/functions/lines 为 50.05/44.64/54.45/50.61、27 文件/97 项真实 PostgreSQL、37/37 Playwright（3.0 分钟，无跳过）。新增搜索旅程 3.4 秒，Study 两项 4.4/3.1 秒。
- 服务器诊断：完整门禁出现两次 `The destination stream closed early.`（Agent Entry 故障/导航阶段，对应用例通过），无 ERR_INVALID_STATE、Controller is already closed 或 unhandledRejection。About 两路径各出现两次 `The requested resource isn't a valid image`；`file public/images/about/xx.jpg public/images/about/oo.jpg` 均报告不存在，`git ls-files public/images/about` 为空，`git check-ignore -v public/images/about/xx.jpg public/images/about/oo.jpg` 均命中 .gitignore:33:images/。硬编码引用仍存在；独立登记 feat-064，尚未实施专门图片验收，不把 Agent Entry 用例通过写成照片正常。
- 未运行：默认开发模式 `./scripts/run-node22.sh npm run check:full` 未重跑；按已有交接采用生产完整门禁，本轮开发只验收新增搜索旅程，feat-063 的两次 Study 全量序列失败仍未定位。`npm run test:compose-smoke` 未运行：未改部署/运行配置，风险由真实数据库与生产浏览器完整门禁覆盖。
- 质量：QAM-05-007 resolved；抽象、状态、接口与健壮性各 +1，73→77/L2，其他六个 P2 保持。[QAM-05 报告](docs/optimization/qam-05-content-timeline-quality-review.md) 与 [总览](docs/optimization/module-quality-overview.md) 同步，组合均分 85.2、开放 QAM P2 为 32。
- 既有内容保护：原 E2E 完整前缀保持，本轮仅追加搜索用例。
- 清理：coverage、test-results、playwright-report 已删除；测试容器/网络/卷及 E2E 临时目录自动退出清理，Docker 只剩原 PostgreSQL 和原 Compose 资源。
- 收尾核验：`python3 -` 首轮 exit 1，链接扫描误把报告中的 `javascript:...` 反例当作文件；排除 URI scheme 后 exit 0，任务字段/依赖、130 个本地链接及行号、历史正文还原和评分算术通过，47 个未涉及既有文件哈希保持。`./scripts/run-node22.sh node /home/dadalv/.agents/skills/harness-creator/scripts/validate-harness.mjs --target /home/dadalv/projects/xoxoMeridian` exit 0、结构 100/100。`git diff --check` 与 status 核验通过；本轮 /tmp 日志、草稿及快照已清理，不保留失败诊断工件。
- 唯一下一步：按 P2 排名开始 feat-058（QAM-10-003，全局 Agent 入口登录失效后仍显示），启动时核对归档依赖 feat-031/040。feat-063/064 均保持独立 not-started。

<a id="feat-056"></a>

## 2026-09-13 — feat-056：聊天 SSE 慢查询串行与关闭生命周期

- 范围：归档依赖 feat-010/036 均为 done，只实施 feat-056；使用 QAM-02 技能更新报告，使用 harness-creator 核验状态与归档。业务代码只修改 Room SSE Route；消息投影、Atlas SSE、客户端 merge、Agent Runtime、数据库 schema/迁移、依赖和部署配置保持。
- 改动：每条连接的 `snapshotInFlight` 同步保护 Session 复核、成员复核和 snapshot；超过 2 秒的查询会跳过重叠 tick，不积累待执行队列。finally 在成功/失败/早退后释放；原 2 秒轮询节拍与 error 恢复保持，abort/cancel 后清理 timer/listener、停止新查询与 enqueue，kicked/roomDeleted 继续发送终止事件后关闭。在途数据库 Promise 自然结束。
- 启动：首次 `./init.sh` exit 0，77 文件/576 项 Vitest；收尾恢复本轮 production build 自动改写且会话开始时干净的 `next-env.d.ts` 后，`./init.sh` 再次 exit 0，类型、lint、77 文件/593 项 Vitest 通过。
- Route 负向对照：`./scripts/run-node22.sh npm run test:unit -- tests/server/room-stream.test.ts` 在旧路由 exit 1、4 failed/16 passed；8 秒时间推进后，慢 snapshot、慢 Session/成员复核预期 2 次调用却出现 5 次，交错失败场景预期 3 次却出现 6 次。加入保护后同命令 exit 0、20/20。覆盖事件顺序、失败后按原节拍恢复、初始/轮询 × abort/cancel × 成功/失败、权限检查关闭竞态、会话删除/过期、roomDeleted、已中止请求与连接间隔离。
- 真实服务器/浏览器负向对照：`./scripts/run-node22.sh npm run test:e2e -- tests/e2e/authenticated.spec.ts --grep '慢查询跨多个轮询周期'` 在旧路由 exit 1、1 passed/1 failed（含 setup）；PostgreSQL Memo 表锁让真实 snapshot SELECT 阻塞，pg_locks 观察到 4 条等待查询，最旧年龄 6.18 秒，预期仅 1 条。修复后同命令 exit 0、2/2（44.6 秒）；跨多个 tick 始终一条查询，释放锁后完成消息与 Agent completed 状态持续三个快照，注入 HTTP connectionreset 并恢复真实 SSE 后，离线消息与新 running Task 持续三个快照一致，UI 同步显示。使用真实 Next.js、PostgreSQL 与原生 EventSource；没有生产故障开关或 snapshot mock。Task/Message 为隔离夹具，不代替 Runtime 执行验证；锁、页面、房间和连接均有清理路径。
- `./scripts/run-node22.sh npm run typecheck` exit 0；`./scripts/run-node22.sh node node_modules/eslint/bin/eslint.js 'app/api/rooms/[roomId]/stream/route.ts' tests/server/room-stream.test.ts tests/e2e/authenticated.spec.ts` exit 0。
- 完整门禁：`E2E_APP_MODE=production ./scripts/run-node22.sh npm run check:full` 单次 exit 0；77 文件/593 项 Vitest、Next.js 16.3.3 production build、覆盖率 statements/branches/functions/lines 为 49.81/44.46/54.17/50.37，26 文件/96 项真实 PostgreSQL、36/36 Playwright（浏览器 4.2 分钟，无跳过）。新增慢查询旅程 21.1 秒；Study 两项 4.2/3.0 秒，原消息窗口旅程 1.4 分钟且通过。浏览器阶段有一次 `The destination stream closed early.` 服务器诊断（Agent Entry 阶段，对应用例通过；该文案属于 React RSC destination close 的取消处理），没有 `ERR_INVALID_STATE`、`Controller is already closed` 或 `unhandledRejection`；不把用例通过写成服务器零诊断。
- 未运行：默认开发模式 `./scripts/run-node22.sh npm run check:full` 未重跑，沿用交接中已验证的生产模式路径；开发模式本轮只验证新增慢查询旅程。feat-063 的两次 Study 完整序列失败仍保留，不声称已经恢复或定位。`npm run test:compose-smoke` 未运行：未修改部署/运行配置，本轮用真实 PostgreSQL 与生产浏览器完整门禁覆盖风险。
- 质量：QAM-02-006 resolved；仅状态一致性与并发/生命周期各 +1，QAM-02 从 94 升至 96/L4；[报告](docs/optimization/qam-02-room-message-quality-review.md) 与 [总览](docs/optimization/module-quality-overview.md) 同步，QAM-02-005 仍为 not-reproduced 历史项。
- 既有内容保护：既有任务除 feat-056 状态/证据外字段保持，原 E2E 扣除本轮新增末尾用例后哈希一致。
- 收尾：已清理 coverage、test-results、playwright-report；测试容器/网络/卷与 E2E 临时目录自动移除，Docker 只剩原 PostgreSQL。42 个未涉及既有文件哈希保持；`python3 -` 定向账本/哈希/链接核验 exit 0（字段、92 个链接、归档还原及评分算术），`./scripts/run-node22.sh node /home/dadalv/.agents/skills/harness-creator/scripts/validate-harness.mjs --target /home/dadalv/projects/xoxoMeridian` exit 0、结构评分 100/100。`git diff --check` 与 status 核验通过；本轮 /tmp 日志、快照与草稿清除，不保留失败诊断工件。
- 唯一下一步：按原 P2 排序开始 feat-057（QAM-05-007，搜索错误反馈与文章展示投影），先核对归档依赖 feat-033/048。feat-063 保持独立 not-started。

<a id="feat-055"></a>

## 2026-09-13 — feat-055：生活字段共享约束与旧记录兼容

- 范围：归档依赖 feat-049 为 done，仅实施 feat-055；使用 QAM-03 技能更新本模块报告。32 个未涉及的既有文件哈希不变，原 E2E 扣除本轮新增用例后逐字相同；其他用户改动保留。
- 改动：`lib/life-authoring-contract.ts` 统一 Memo title/content 500/20000、Schedule description 500 字符，按 trim 后 JavaScript 字符串长度判断；HTTP/Agent/UI 共享基础 schema 和 field shape，对象 schema 仅在服务端组装。Memo 缺省标题为“新的备忘录”，显式空白/null 标题或正文拒绝；描述 null/空白清空、undefined 省略。完整策略见 [QAM-03](docs/optimization/qam-03-life-plan-quality-review.md)。
- 兼容：采用既有 Agent 较大上限，无迁移/截断；UI 只 PATCH 编辑过的文本，超限旧字段及首尾空白可保留并修改其他字段，aria-describedby 说明修改限制。fireAt、active cap、Scheduler、schema、依赖与运行配置保持。
- 启动基线：`./init.sh` exit 0，TypeScript、lint、75 文件/544 项 Vitest 通过。
- 契约负向对照：`./scripts/run-node22.sh npm run test:unit -- tests/lib/life-authoring-contract.test.ts`，旧 contract exit 1（25 failed/1 passed），修复后 exit 0、26/26；覆盖四入口边界/超限、trim、空白/null/非字符串、default/省略及 JSON schema 导出。
- 组件负向对照：`./scripts/run-node22.sh npm run test:component -- tests/component/life-authoring-fields.test.tsx` 在旧 Modal + 新 contract 下 exit 1（5 failed/1 passed）：旧 maxLength 阻止长字段修改、旧字段提示/默认标题缺失。修复后 `./scripts/run-node22.sh npm run test:component -- tests/component/life-authoring-fields.test.tsx tests/component/life-panel-modals.test.tsx` exit 0、11/11；MSW 使用真实 HTTP schema。
- 真实 PostgreSQL：`./scripts/run-node22.sh npm run test:integration -- tests/integration/life-authoring-fields.integration.test.ts tests/integration/scheduled-job-one-shot-fireat.integration.test.ts tests/integration/scheduled-job-active-cap.integration.test.ts` exit 0、3 文件/23 项。含新增 9 项 Agent Registry create/update 与 HTTP POST/PATCH 回读、超限无写入、null/空白清空、省略保留、超过上限旧字段与首尾空白无损；既有一次性时间 11 项和 cap 竞争 3 项通过。
- 浏览器：`./scripts/run-node22.sh npm run test:e2e -- tests/e2e/authenticated.spec.ts --grep 'Agent 创建的较长备忘录'` exit 0、2/2（含 setup）。隔离房间的持久化计划由独立 Agent Runtime 进程实际消费，生成 300/9000/300 字符记录与 2 条 completed ToolCall；UI 用键盘替换末字后 PATCH 200，真实 DB 回读和刷新重开一致，nextRunAt/cron 保持。LLM 为测试 mock，无真实网络/凭据。
- `./scripts/run-node22.sh npm run typecheck` exit 0。完整门禁 `./scripts/run-node22.sh npm run check:full` 首次 exit 1：77 文件/576 项 Vitest、production build、覆盖率 49.29/43.91/54.03/49.97、26 文件/96 项 PostgreSQL 通过；Playwright 为 33 passed/2 failed。`starts and stops a focus session` 等待 `getByText(/专注中 ·/)` 5 秒超时，快照显示“开始专注”处于 disabled；后续到期恢复用例等待“开始专注”及 `/api/study/start` 30 秒超时，页面已有 running state，伴随 24:57→24:56 的 hydration mismatch。尚不能仅凭日志确定首个请求延迟原因；未修改 Study 或其测试。未改代码的定向复核 `./scripts/run-node22.sh npm run test:e2e -- tests/e2e/authenticated.spec.ts --grep 'starts and stops a focus session|reconciles one expired focus session'` exit 0、3/3（含 setup）；首轮失败未稳定复现。相同 `./scripts/run-node22.sh npm run check:full` 重跑再次 exit 1，仍为同样两项 Study 失败（33 passed/2 failed），标准门禁与 26/96 PostgreSQL 均通过，覆盖率为 49.34/43.95/54.03/49.97。已按全局最大编号 +1 独立登记 feat-063（not-started，不改变原前十项 P2 排序），不把全量序列问题误称偶发恢复。生产对照 `E2E_APP_MODE=production ./scripts/run-node22.sh npm run check:full` exit 1：标准门禁与 26/96 PostgreSQL 通过，Study 两项通过；Playwright 34 passed/1 failed，Agent Entry 首帧/Chat 往返用例收到 `["script-src"]`（应为 `[]`）。定位为本轮把 Zod 对象 schema 引入客户端后，其构造阶段的 `allowsEval` 探测触发 CSP；已经在 feat-055 范围内把对象组装留在服务端，浏览器只消费基础字段 schema，并在长记录旅程增加 CSP 事件断言。原 `proxy.ts`、CSP 策略及 Study 用例未改；CSP 修正后 `./scripts/run-node22.sh npm test -- tests/lib/life-authoring-contract.test.ts tests/component/life-authoring-fields.test.tsx tests/component/life-panel-modals.test.tsx tests/agent/schedule-tool.test.ts` exit 0、4 文件/67 项；`E2E_APP_MODE=production ./scripts/run-node22.sh npm run test:e2e -- tests/e2e/agent-entry-authenticated.spec.ts tests/e2e/authenticated.spec.ts --grep '真实首帧、构建主题|Agent 创建的较长备忘录'` exit 0、3/3（含 setup），两旅程均无 CSP violation。最终 `E2E_APP_MODE=production ./scripts/run-node22.sh npm run check:full` exit 0：77 文件/576 项 Vitest、production build、覆盖率 49.32/43.91/54.03/50.00、26 文件/96 项 PostgreSQL、35/35 Playwright。最终代码的默认开发完整序列未重跑；其两次失败留在 feat-063 继续复核，不声称开发模式已恢复。`npm run test:compose-smoke` 未运行：本轮未修改部署/运行配置，风险由完整数据库与浏览器门禁覆盖。
- 收尾：QAM-03-005 resolved、93/L4，总览 QAM 开放 P2 为 34；feat-055 done，feat-063 仅登记。Docker 只剩原 `xoxo-meridian-postgres`，无 Testcontainers 卷/网络；测试连接串、app-info、E2E 临时目录已自动移除。已清理 coverage、test-results、playwright-report、本轮 /tmp 日志与快照，不保留诊断失败工件。JSON/依赖/链接、历史还原、体积与 `git diff --check`/status 核验通过。
- 唯一下一步：按原 P2 排序开始 feat-056（聊天 SSE snapshot 重入），先核对归档依赖 feat-010/036；feat-063 保持独立 not-started，不改变前十项顺序。

<a id="feat-054"></a>

## 2026-09-13 — feat-054：计划控件名称与键盘操作

- 范围与改动：已核对归档依赖 feat-044 为 done；只实现 QAM-03-006。`CronBuilder` 用 `useId`、独立小时/分钟 label 与 fieldset/legend 表达执行时间；`TimezoneSelector` 用 `useId` 绑定 label/select。新增 `cron-timezone-controls.test.tsx`，既有 Modal 时区查询增加 name，`authenticated.spec.ts` 新增键盘创建/刷新重开旅程。字段长度、默认时区、cron/one-shot、active cap 与调度逻辑保持。
- 启动基线：`./init.sh` exit 0，TypeScript、lint、74 文件/541 项 Vitest 通过。
- 组件负向对照与修复：`./scripts/run-node22.sh npm run test:component -- tests/component/cron-timezone-controls.test.tsx tests/component/life-panel-modals.test.tsx`，旧组件 exit 1（5 failed/3 passed；找不到名为“执行时间”的 group、“时区”的 combobox，spinbutton 名称为空），修复后 exit 0、8/8。覆盖多个实例各自的 label 关联、标签聚焦及键盘修改小时/分钟；jsdom 的 select 值选择使用 `selectOptions`，原生方向键由 Chromium 验证。
- 浏览器迭代：`./scripts/run-node22.sh npm run test:e2e -- tests/e2e/authenticated.spec.ts --grep '仅用键盘创建计划|resolves life panel identity'` 两次 exit 1，均为 2 passed/1 failed。首次误把入口 title“新建任务”当可访问名称（实际为“+ 新建”），30 秒超时且清理导航报 `Target page, context or browser has been closed`；改为 title 定位并保证清理继续。第二次键盘创建已返回 201、页面已显示记录，但 `response.json: Test timeout of 30000ms exceeded`；去掉重复的响应正文断言，保留 201、真实 DB 回读和刷新重开断言。两次中的第二参与者默认时区旅程均通过。
- 最终定向浏览器：`./scripts/run-node22.sh npm run test:e2e -- tests/e2e/authenticated.spec.ts --grep '仅用键盘创建计划'` exit 0、2/2（含 setup）；从入口、小时/分钟、原生时区 ArrowDown 到提交全程键盘，DB 与刷新后表单均为 `45 18 * * *`、`Europe/London`，prompt/description 保持。
- 完整门禁：`./scripts/run-node22.sh npm run check:full` 首次 exit 2，新增组件测试的 6 处角色查询报 `TS2769: 'exact' does not exist in type 'ByRoleOptions'`；移除不支持的选项，保留默认精确 name 匹配。相同命令重跑各项均通过：TypeScript、lint、75 文件/544 项 Vitest、Next.js production build、覆盖率 48.95/43.58/53.54/49.68、25 文件/87 项 PostgreSQL、34/34 Playwright。
- 终态恢复：权限/环境切换后 `write_stdin(session_id=30069)` 返回 `Unknown process id`；`tail -n 65 /tmp/xoxo-feat054-check-full.log` 在沙箱与原权限边界均为文件不存在，不能补造原 shell 退出码。此前已观察到标准门禁与 25/87 PostgreSQL 通过；`cat test-results/playwright/.last-run.json` 为 passed，Python stdlib 解包 `playwright-report/index.html` 内嵌 `report.json` 得到 total=expected=34、unexpected=flaky=skipped=0、ok=true，确认最终浏览器全部通过。
- 清理复核：`docker ps -a --format '{{.ID}} {{.Names}} {{.Image}}'` 及 `docker volume ls --filter label=org.testcontainers=true --format '{{.Name}}'`、`docker network ls --filter label=org.testcontainers=true --format '{{.Name}}'` 在新沙箱均报 Docker socket permission denied；相同命令在获准正常边界 exit 0，只剩既有 `xoxo-meridian-postgres`，无 Testcontainers 卷/网络。测试服务已删除连接串与 app-info 文件；`rm -rf coverage test-results playwright-report` exit 0，清除本轮测试报告/账号缓存；原 /tmp 临时工件已随环境切换消失，没有保留诊断失败日志。
- 文档与范围：QAM-03-006 resolved、90/L4，模块总览开放 P2 为 35；feat-054 标记 done。仅修改两个产品组件、对应测试和报告/状态；此前 28 个既有改动文件哈希及 E2E 扣除本轮增量后的还原哈希核验通过，后续未修改这些业务内容。
- `npm run test:compose-smoke` 未运行：本轮未改部署、运行或构建配置，已执行包含标准门禁与真实数据库/浏览器的完整验证。当前无阻塞；Node 账本核验 exit 0（ID 唯一、状态及依赖满足），Python 相对链接/归档还原/90 分算术核验通过；`git diff --check` exit 0，`git status --short` 已核对。
- 唯一推荐下一步：开始 **feat-055（QAM-03-005，Memo/计划跨 UI 与 Agent 字段约束一致性）**，先核对归档依赖 feat-049，不启动其他 P2。

<a id="feat-062"></a>

## 2026-09-12 — feat-062：当前状态与历史分离

- 范围：只整理 Harness 文档和状态。根 feature 保留全部未完成项及完整验收；已完成任务移入归档，`schemaVersion=2` 用 `archivedFeatureFiles` 声明全量账本。原有 P2 排名和唯一后续产品任务 `feat-054` 保持。
- Files Changed（改动文件）：`AGENTS.md`、三份根状态文件、新增 `docs/harness/README.md` 与 `docs/harness/archive/` 下的历史记录。归档来自当前工作树，覆盖既有未提交的 feat-051～053 记录。
- 保留约定：用户此前要求没有代码改动时不必运行应用验证，现提升到 `AGENTS.md`。本轮未运行 `./init.sh`、`npm run check`、`npm run check:full`、`npm run test:compose-smoke`：仅文档和状态整理，按该例外核验，不声称应用测试、构建或部署本轮通过。
- Verification Evidence（验证证据）：[维护说明](docs/harness/README.md) 内的三个只读命令均实际 exit 0：Node 按 ID 提取归档 feat-044、`rg` 定位 feat-040/日期标题、Node 合并账本核验 JSON/状态/依赖/体积（ID 唯一，单活动项约束满足）。Python 迁移比较确认原任务字段与迁移前一致；历史进度的正文保留，仅修正相对链接。
- `./scripts/run-node22.sh node /home/dadalv/.agents/skills/harness-creator/scripts/validate-harness.mjs --target .` exit 0、100/100；指令、状态、验证、范围、生命周期均 5/5，迁移前后结构评分相同。此评分只说明当时的结构完备，不作为现行归档依据。
- 本轮 Markdown 相对链接核验通过；`git diff --check` exit 0，`git status --short` 已检查，25 个既有业务文件的 SHA-256 均与会话开始一致；未新增测试、临时工件或服务，没有保留失败日志。

- Blockers（阻塞）：无。文档验收通过，feat-062 标记 done；未修改应用、依赖或运行配置。
- Next（唯一推荐下一步）：按既有 P2 排名开始 **feat-054（QAM-03-006，计划控件可访问名称与键盘操作）**，核对归档中的 feat-044 依赖后运行 `./init.sh`，不启动其他 P2。

### 近期应用验证（历史证据）

| 已完成项 | 当时的实际结果 |
| --- | --- |
| feat-053 / QAM-08-005 | `./scripts/run-node22.sh npm run check:full` exit 0；Vitest 74 文件/541 项、production build、覆盖率 49.00/43.61/53.54/49.68、PostgreSQL 25/87、Playwright 33/33 |
| feat-052 / QAM-06-007 | 同一完整门禁 exit 0；Vitest 73/496、production build、覆盖率 47.76/42.59/52.56/48.54、PostgreSQL 24/75、Playwright 32/32 |
| feat-051 / QAM-02-002 | 同一完整门禁 exit 0；Vitest 72/482、production build、覆盖率 47.72/42.56/52.56/48.54、PostgreSQL 23/71、Playwright 31/31 |

这些结果及修复前失败命令、原因、重跑和清理证据完整保留在 [历史进度](docs/harness/archive/progress-through-2026-09-12.md)，按 feature 标题提取即可；feat-040 的生产主题与 Compose 结果也在该文件中，只能作为历史 E3。当前 QAM 状态以 [模块总览](docs/optimization/module-quality-overview.md) 及各报告为准。
