// F1D4A P1 — 모의 DOM(Node 러너용). 시험 하네스 전용.
// F1 test_runner.js 의 makeElement · makeDocument 를 그대로 옮긴 것이다(내용 변경 없음). Node 러너와 타이머 차이 시험(TM)이 같은 소스를 쓴다.
function makeElement(tagName) {
    let html = '';
    let text = '';
    let classes = new Set();
    const element = {
        tagName: String(tagName || 'div').toUpperCase(),
        kids: [],
        parentNode: null,
        isConnected: true,
        checked: false,
        onclick: null,
        listeners: {},
        classList: {
            add(...names) { names.forEach(name => classes.add(String(name))); },
            remove(...names) { names.forEach(name => classes.delete(String(name))); },
            contains(name) { return classes.has(String(name)); }
        },
        appendChild(child) {
            child.parentNode = this;
            child.isConnected = true;
            this.kids.push(child);
            return child;
        },
        removeChild(child) {
            this.kids = this.kids.filter(item => item !== child);
            child.parentNode = null;
            child.isConnected = false;
            return child;
        },
        querySelectorAll(selector) {
            if (selector === 'button') return this.kids.filter(child => child.tagName === 'BUTTON');
            return this.kids.slice();
        },
        addEventListener(type, callback) {
            (this.listeners[type] ||= []).push(callback);
        },
        click() {
            if (typeof this.onclick === 'function') this.onclick();
            (this.listeners.click || []).forEach(callback => callback({ target: this }));
        },
        scrollIntoView() {},
        set innerHTML(value) {
            html = String(value == null ? '' : value);
            if (html === '') this.kids = [];
        },
        get innerHTML() { return html; },
        set innerText(value) { text = String(value == null ? '' : value); },
        get innerText() { return text; },
        set textContent(value) { text = String(value == null ? '' : value); },
        get textContent() { return text; }
    };
    Object.defineProperty(element, 'className', {
        get() { return Array.from(classes).join(' '); },
        set(value) { classes = new Set(String(value || '').split(/\s+/).filter(Boolean)); }
    });
    return element;
}

function makeDocument() {
    const elements = new Map();
    const screenIds = ['screen-start', 'screen-loading', 'screen-play', 'screen-result'];
    screenIds.forEach((id, index) => {
        const screen = makeElement('div');
        screen.id = id;
        screen.className = index === 0 ? 'screen active' : 'screen hidden';
        elements.set(id, screen);
    });
    return {
        getElementById(id) {
            if (!elements.has(id)) {
                const element = makeElement('div');
                element.id = id;
                elements.set(id, element);
            }
            return elements.get(id);
        },
        createElement(tagName) { return makeElement(tagName); },
        querySelectorAll(selector) {
            return selector === '.screen' ? screenIds.map(id => elements.get(id)) : [];
        },
        _elements: elements
    };
}
module.exports = { makeElement, makeDocument };
