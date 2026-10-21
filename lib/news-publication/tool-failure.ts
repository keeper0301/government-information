// 공통 작성 도구가 만든 고정 접두사만 읽고 원시 응답·키·본문은 버립니다.
export function newsToolFailure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const statusMatch = /^OpenAI API 오류 ([45]\d{2}):/.exec(message);
  if (statusMatch) {
    const httpStatus = Number(statusMatch[1]);
    // 온전한 오류 객체의 알려진 코드만 해석합니다. 잘린 응답은 원인을 추측하지 않습니다.
    if (httpStatus === 429) {
      try {
        const body = JSON.parse(message.slice(statusMatch[0].length));
        if (body?.error?.code === 'credit_balance_exhausted')
          return { reason: '작성 도구의 결제 잔액이 소진됐습니다.', detail: { kind: 'credit_exhausted', httpStatus } };
        if (body?.error?.code === 'insufficient_quota' || body?.error?.type === 'insufficient_quota')
          return { reason: '작성 도구 사용 한도가 부족합니다. 잔액과 한도 설정 확인이 필요합니다.',
            detail: { kind: 'insufficient_quota', httpStatus } };
      } catch { /* 응답 본문은 기록하지 않고 일반적인 요청량·한도 오류로 남깁니다. */ }
    }
    const kind = httpStatus === 408 ? 'timeout' : httpStatus === 401 ? 'authentication' : httpStatus === 403 ? 'permission'
      : httpStatus === 429 ? 'rate_or_quota' : httpStatus >= 500 ? 'provider_unavailable' : 'request_rejected';
    const reasons = {
      timeout: '작성 도구 응답 대기 시간이 초과됐습니다.',
      authentication: '작성 도구 인증에 실패했습니다.', permission: '작성 도구 사용 권한이 거부됐습니다.',
      rate_or_quota: '작성 도구 요청량 또는 사용 한도에 걸렸습니다.',
      provider_unavailable: '작성 도구 제공 서버에서 오류가 발생했습니다.',
      request_rejected: '작성 도구가 요청을 거부했습니다. 요청 형식과 설정 확인이 필요합니다.',
    };
    return { reason: reasons[kind], detail: { kind, httpStatus } };
  }
  const known = [
    ['OPENAI_API_KEY 환경변수 누락', 'missing_key', '작성 도구 인증 설정이 없습니다.'],
    ['OpenAI 응답 타임아웃 (', 'timeout', '작성 도구 응답 대기 시간이 초과됐습니다.'],
    ['OpenAI 호출 실패:', 'connection', '작성 도구 연결에 실패했습니다.'],
    ['OpenAI 응답 본문 형식 오류', 'response_format', '작성 도구 응답 형식을 읽지 못했습니다.'],
    ['OpenAI 응답 본문 읽기 실패', 'response_read', '작성 도구 응답을 끝까지 읽지 못했습니다.'],
    ['OpenAI 응답에서 텍스트 추출 실패', 'empty_response', '작성 도구 응답에서 글을 찾지 못했습니다.'],
    ['JSON 파싱 실패:', 'invalid_json', '작성된 글의 응답 형식을 해석하지 못했습니다.'],
  ];
  const match = known.find(([prefix]) => message.startsWith(prefix));
  return { reason: match?.[2] ?? '작성 도구 호출 또는 응답 처리에 실패했습니다.',
    detail: { kind: match?.[1] ?? 'unknown' } };
}
