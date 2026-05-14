import { afterEach, describe, expect, it } from 'vitest';

import { shouldSuppress } from './capture-hotkey-helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

function makeEvent(init: Partial<KeyboardEvent> & { target?: HTMLElement }): KeyboardEvent {
  const target = init.target ?? document.createElement('div');
  if (!target.isConnected) document.body.appendChild(target);
  const event = new KeyboardEvent('keydown', { key: 'c', cancelable: true, ...init });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('shouldSuppress', () => {
  it('does not suppress on a plain key with a non-editable target', () => {
    expect(shouldSuppress(makeEvent({}))).toBe(false);
  });

  it('suppresses when the target is an INPUT', () => {
    expect(shouldSuppress(makeEvent({ target: document.createElement('input') }))).toBe(true);
  });

  it('suppresses when the target is a TEXTAREA', () => {
    expect(shouldSuppress(makeEvent({ target: document.createElement('textarea') }))).toBe(true);
  });

  it('suppresses when the target is a SELECT', () => {
    expect(shouldSuppress(makeEvent({ target: document.createElement('select') }))).toBe(true);
  });

  it('suppresses contenteditable targets', () => {
    const target = document.createElement('div');
    target.setAttribute('contenteditable', 'true');
    expect(shouldSuppress(makeEvent({ target }))).toBe(true);
  });

  it('suppresses when an ancestor opts out via data-capture-hotkey-ignore', () => {
    const wrapper = document.createElement('section');
    wrapper.setAttribute('data-capture-hotkey-ignore', '');
    const target = document.createElement('div');
    wrapper.appendChild(target);
    document.body.appendChild(wrapper);
    expect(shouldSuppress(makeEvent({ target }))).toBe(true);
  });

  it('suppresses when a modifier is held', () => {
    expect(shouldSuppress(makeEvent({ metaKey: true }))).toBe(true);
    expect(shouldSuppress(makeEvent({ ctrlKey: true }))).toBe(true);
    expect(shouldSuppress(makeEvent({ altKey: true }))).toBe(true);
  });

  it('suppresses when defaultPrevented', () => {
    const e = makeEvent({});
    e.preventDefault();
    expect(shouldSuppress(e)).toBe(true);
  });

  it('suppresses while IME composition is in progress', () => {
    const e = makeEvent({});
    Object.defineProperty(e, 'isComposing', { value: true });
    expect(shouldSuppress(e)).toBe(true);
  });
});
