// jsdom에는 canvas가 없어서 getContext가 경고만 찍고 null을 준다.
// 미리 null을 돌려주게 해 두면 이름표 폭은 글자 종류별 어림값으로 계산된다.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
