/**
 * **诊断通道**：把一段 JSON POST 给本插件自己的 Node 半边（`/oblivion-panel/diag`），
 * 它落盘到 `<dataRoot>/panel-client-diag.json`。
 *
 * 为什么由浏览器半边发回来：客户端 `ctx` 才是 `inject` / `slots` 的主场，
 * 而浏览器半边没有 fs 权限 —— 这条路由是唯一的落盘路径。
 *
 * 两条约定（都关系「怎么读这个文件」）：
 *
 *   ① 落盘是**覆盖**式的（`{...body, receivedAt}`），所以文件里永远是**最后一次**报告 ——
 *      用 `where` 区分种类（`client` = 装载时的 ctx 形状；`settings-section` = 设置分节
 *      被真正挂载/读过一次；`open-note` / `leftbar-click` = 点了一下的结果）；
 *   ② **诊断失败绝不影响功能**：这个函数吞掉一切异常，调用点也不 await。
 *
 * 从 `index.ts` 拆出来的理由：设置分节（`SettingsSection.tsx`）也要发报告，
 * 而它若反过来 import `index.ts` 就成环 —— 抽成这个叶子模块，两边都只依赖它。
 */

/** 报告一段 JSON 给 Node 半边（失败什么都不做）。 */
export function postDiag(payload: Record<string, unknown>): void {
  try {
    void fetch('/oblivion-panel/diag', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'same-origin',
    }).catch(() => undefined);
  } catch {
    // 诊断本身绝不影响装载
  }
}
