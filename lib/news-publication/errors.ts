// 보류된 초안은 공개하지 않고 관리자 전용 근거 저장소에만 보관합니다.
export class NewsDraftError extends Error {
  constructor(reason: string, readonly evidence: unknown) {
    super(reason);
    this.name = 'NewsDraftError';
  }
}
