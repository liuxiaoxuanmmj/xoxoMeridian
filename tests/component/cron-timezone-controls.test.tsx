import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CronBuilder } from "@/components/chat/CronBuilder";
import { TimezoneSelector } from "@/components/chat/TimezoneSelector";

function CronForm({ initialValue }: { initialValue: string }) {
  const [cron, setCron] = useState(initialValue);

  return (
    <>
      <CronBuilder value={cron} onChange={setCron} />
      <output aria-label="Cron 表达式">{cron}</output>
    </>
  );
}

const participants = [
  {
    id: "user-1",
    displayName: "Alice",
    avatarLabel: "A",
    profile: { city: "Shanghai", country: "CN", timezone: "Asia/Shanghai" },
  },
  {
    id: "user-2",
    displayName: "Bob",
    avatarLabel: "B",
    profile: { city: "London", country: "GB", timezone: "Europe/London" },
  },
];

describe("计划时间控件的可访问交互", () => {
  it("通过名称辨认小时和分钟，并用键盘修改时间且保留重复日期", async () => {
    const user = userEvent.setup();
    render(<CronForm initialValue="0 9 * * 1-5" />);

    const time = screen.getByRole("group", { name: "执行时间" });
    const hour = within(time).getByRole("spinbutton", { name: "小时" });
    const minute = within(time).getByRole("spinbutton", { name: "分钟" });
    expect(hour).toHaveValue(9);
    expect(minute).toHaveValue(0);

    await user.tab();
    expect(hour).toHaveFocus();
    await user.keyboard("{Control>}a{/Control}18");
    await user.tab();
    expect(minute).toHaveFocus();
    await user.keyboard("{Control>}a{/Control}45");

    expect(hour).toHaveValue(18);
    expect(minute).toHaveValue(45);
    expect(screen.getByRole("status", { name: "Cron 表达式" })).toHaveTextContent("45 18 * * 1-5");
    expect(screen.getByText("工作日 18:45 执行")).toBeVisible();
  });

  it("同时挂载的两个 Cron 实例各自关联小时和分钟标签", () => {
    render(
      <>
        <section aria-label="早间计划"><CronForm initialValue="15 9 * * *" /></section>
        <section aria-label="晚间计划"><CronForm initialValue="45 18 * * 1-5" /></section>
      </>
    );

    for (const [name, hour, minute] of [["早间计划", 9, 15], ["晚间计划", 18, 45]] as const) {
      const region = within(screen.getByRole("region", { name }));
      const time = within(region.getByRole("group", { name: "执行时间" }));
      const hourInput = time.getByRole("spinbutton", { name: "小时" });
      const minuteInput = time.getByRole("spinbutton", { name: "分钟" });
      expect(time.getByLabelText("小时", { exact: true })).toBe(hourInput);
      expect(time.getByLabelText("分钟", { exact: true })).toBe(minuteInput);
      expect(hourInput).toHaveValue(hour);
      expect(minuteInput).toHaveValue(minute);
    }
  });

  it("默认和自定义时区标签分别聚焦自己的下拉框并传递选项值", async () => {
    const user = userEvent.setup();
    const firstChange = vi.fn();
    const secondChange = vi.fn();
    render(
      <>
        <TimezoneSelector value="Asia/Shanghai" onChange={firstChange} participants={participants} />
        <TimezoneSelector label="执行时区" value="Europe/London" onChange={secondChange} participants={participants} />
      </>
    );

    const first = screen.getByRole("combobox", { name: "时区" });
    const second = screen.getByRole("combobox", { name: "执行时区" });
    expect(screen.getByLabelText("时区", { exact: true })).toBe(first);
    expect(screen.getByLabelText("执行时区", { exact: true })).toBe(second);

    await user.tab();
    expect(first).toHaveFocus();
    await user.tab();
    expect(second).toHaveFocus();
    await user.click(screen.getByText("时区", { selector: "label", exact: true }));
    expect(first).toHaveFocus();
    await user.click(screen.getByText("执行时区", { selector: "label", exact: true }));
    expect(second).toHaveFocus();
    // jsdom 不实现原生 select 的方向键默认动作；真实键盘选择由 Playwright 覆盖。
    await user.selectOptions(second, "Asia/Shanghai");
    expect(secondChange).toHaveBeenCalledWith("Asia/Shanghai");
    expect(firstChange).not.toHaveBeenCalled();
  });
});
