/* eslint-disable @typescript-eslint/no-require-imports -- 메모리에서 변환한 타입스크립트를 공통 모듈 방식으로 읽는 전용 검사 도구입니다. */
// 실제 서버와 같은 노드 환경에서 수집기를 읽는 검사 도구입니다.
// 검사 도구의 가상 실행 환경에서 PDF 읽기가 실패하는 경우를 구분할 때 사용합니다.
// 새 도구를 설치하지 않고 이미 설치된 타입스크립트를 잠깐 메모리에서 변환합니다.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const projectRoot = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (specifier, parent, ...options) {
  const mapped = specifier.startsWith("@/")
    ? path.resolve(projectRoot, specifier.slice(2)) : specifier;
  return originalResolve.call(this, mapped, parent, ...options);
};
require.extensions[".ts"] = function (module, file) {
  const source = fs.readFileSync(file, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(outputText, file);
};
// 이 파일 자체는 사이트를 호출하거나 자료를 저장하지 않습니다.
module.exports = {
  loadCollector: (city) => require(path.join(projectRoot, "lib", "scraping", "local-press", `${city}.ts`)),
  loadTypescript: (relativePath) => require(path.join(projectRoot, relativePath)),
};
