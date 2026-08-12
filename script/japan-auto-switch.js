// Loon 日本策略定时切换
// 20:00 ～ 次日 01:59：使用 【自建-ALL日本-HY2】
// 02:00 ～ 19:59：使用 【自建-ALL日本-VLESS】
// 时间以 iPhone / iPad 当前系统时区为准。

const PARENT = "【自建-ALL日本】";
const VLESS = "【自建-ALL日本-VLESS】";
const HY2 = "【自建-ALL日本-HY2】";

const hour = new Date().getHours();
const target = (hour >= 20 || hour < 2) ? HY2 : VLESS;
const current = $config.getSelectedPolicy(PARENT);

if (current === target) {
  console.log(`[日本策略定时切换] 无需切换，当前已经是：${target}`);
  $done();
} else {
  const success = $config.getConfig(PARENT, target);

  if (success) {
    console.log(`[日本策略定时切换] 切换成功：${current} -> ${target}`);
    $notification.post(
      "Loon 日本策略定时切换",
      "切换成功",
      `${current} → ${target}`
    );
  } else {
    console.log(`[日本策略定时切换] 切换失败：${current} -> ${target}`);
    $notification.post(
      "Loon 日本策略定时切换",
      "切换失败",
      `请检查策略组名称：${PARENT} / ${target}`
    );
  }

  $done();
}
