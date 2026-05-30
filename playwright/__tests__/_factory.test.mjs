// factory 정규식 2종 단위 테스트 (node --test, 외부 의존성 0).
// silent 회귀 방어: 사장님 비개발자 운영 + 미래 클로드가 정규식 만질 때 안전망.
// 실행: cd playwright && npm test (또는 node --test __tests__/_factory.test.mjs)

import test from "node:test";
import assert from "node:assert/strict";
import { stripUiLabels, stripTitleBadges } from "../lib/_factory.mjs";

test("stripUiLabels — 이미지/사진 + 확대보기/다운로드 라벨 제거", () => {
  assert.equal(stripUiLabels("이미지 확대보기"), "");
  assert.equal(stripUiLabels("사진 확대보기"), "");
  assert.equal(stripUiLabels("이미지 다운로드"), "");
  assert.equal(stripUiLabels("사진 다운로드"), "");
});

test("stripUiLabels — 포토갤러리 정지/재생 라벨 제거", () => {
  assert.equal(stripUiLabels("포토갤러리 정지"), "");
  assert.equal(stripUiLabels("포토갤러리 재생"), "");
});

test("stripUiLabels — <사진 설명> 라벨 제거 (캡션 텍스트 보존)", () => {
  assert.equal(stripUiLabels("<사진 설명>"), "");
  assert.equal(stripUiLabels("<사진설명>"), "");
  assert.equal(stripUiLabels("<  사진  설명  >"), "");
  assert.equal(stripUiLabels("본문 <사진 설명> 착수 보고회 모습"), "본문 착수 보고회 모습");
});

test("stripUiLabels — 정상 한국어 꺾쇠 (행사명) 영향 0", () => {
  // 창원·동래·노원의 정상 본문 패턴 — 행사명 꺾쇠 유지
  assert.equal(stripUiLabels("행사명 <제4회 환경교육주간>"), "행사명 <제4회 환경교육주간>");
  assert.equal(stripUiLabels("<청년이 Green 노원 실험실>"), "<청년이 Green 노원 실험실>");
});

test("stripUiLabels — 연속 공백 압축 + trim", () => {
  assert.equal(stripUiLabels("  본문  여러  공백  "), "본문 여러 공백");
});

test("stripUiLabels — 정상 본문 텍스트 영향 0", () => {
  const body = "안산시는 주민 생활과 밀접한 지원사업을 추진한다고 밝혔다.";
  assert.equal(stripUiLabels(body), body);
});

test("stripTitleBadges — 끝의 '새 글'/'NEW' 배지 strip", () => {
  assert.equal(stripTitleBadges("제목 새 글"), "제목");
  assert.equal(stripTitleBadges("제목 NEW"), "제목");
  assert.equal(stripTitleBadges("제목  새  글"), "제목"); // 다중 공백
  assert.equal(stripTitleBadges("제목 새글"), "제목"); // 공백 없는 변형
});

test("stripTitleBadges — 소문자 'new'/'New' 보존 (영문 자연어)", () => {
  assert.equal(stripTitleBadges("Smart City New"), "Smart City New");
  assert.equal(stripTitleBadges("AI 챗봇 launch new"), "AI 챗봇 launch new");
});

test("stripTitleBadges — 정상 제목 영향 0", () => {
  const t = "안산시, 2026년 2분기 청년기본소득 신청 접수";
  assert.equal(stripTitleBadges(t), t);
});

test("stripTitleBadges — 끝 아닌 '새 글'은 보존 (안쪽은 영향 0)", () => {
  // 끝에만 매치하는 정규식이라 안쪽은 그대로
  assert.equal(stripTitleBadges("새 글 페스티벌 개최"), "새 글 페스티벌 개최");
});
