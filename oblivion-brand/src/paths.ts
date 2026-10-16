/**
 * 品牌插件的宿主路由路径。
 *
 * **宿主半边与浏览器半边共用这一处定义**：路径写两遍就一定会漂（本仓库已经在
 * 「版本号写两遍」上付过一次代价，见 HANDOFF 的工程基建一节）。本文件**只放常量**，
 * 因此可以安全地被打进客户端产物（不引任何 `node:` 模块）。
 */

/** 重启 DSH 桌面端（POST，宿主派生游离 helper）。 */
export const RESTART_PATH = '/obl-brand/restart';

/** 个人已安装插件清单（GET，只读；供设置面板列出并复制恢复命令）。 */
export const PLUGINS_PATH = '/obl-brand/plugins';

/**
 * 清理 web-login 遗留的孤儿 Chromium 进程（POST，**不重启**）。
 *
 * 与重启路由分开的理由：重启会把会话打断，而这个动作只想把被占住的传输 profile
 * 目录解开 —— 现场「三个账号全红」时，用户要的是后者。
 */
export const ORPHANS_PATH = '/obl-brand/orphans';
