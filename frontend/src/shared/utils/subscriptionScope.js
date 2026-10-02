export function createSubscriptionScope() {
  let active = true;
  let revision = 0;
  return {
    guard: callback => (...args) => { if (active) callback(...args); },
    next: () => ++revision,
    isCurrent: token => active && token === revision,
    close: () => { active = false; },
  };
}
