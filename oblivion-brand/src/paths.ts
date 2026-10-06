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
