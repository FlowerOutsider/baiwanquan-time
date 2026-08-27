// 原生悬浮窗与主计时页之间的单一桥接层；避免把窗口通信散落进页面交互代码。
export const connectFloatingTimer = ({ bridge, widget, menu, digits }) => {
  widget.hidden = false;
  menu.hidden = true;
  bridge?.onTimerState(({ value, running }) => {
    digits.innerHTML = `<i class="time-part time-hour">${value.slice(0, 3)}</i><i class="time-part time-minute">${value.slice(3, 6)}</i><i class="time-part time-second">${value.slice(6)}</i>`;
    widget.classList.toggle('is-paused', !running);
  });
  bridge?.onFloatCollapsed((state) => {
    const collapsed = Boolean(state);
    if (collapsed) menu.hidden = true;
    widget.classList.toggle('is-collapsed', collapsed);
    ['dock-left', 'dock-right', 'dock-top', 'dock-bottom'].forEach((name) => widget.classList.toggle(name, collapsed && state?.side === name.slice(5)));
  });
  bridge?.onFloatPinned((pinned) => widget.querySelector('#floatToggleButton')?.classList.toggle('is-pinned', Boolean(pinned)));
  bridge?.onFloatMenuClose(() => { menu.hidden = true; });
};
