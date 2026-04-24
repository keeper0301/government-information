@AGENTS.md

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health

## Git workflow (keepioo 고유)

이 프로젝트는 사장님 1명이 단독 운영하는 keepioo.com 서비스이며, PR review
프로세스가 없는 대신 `master` 브랜치 직접 커밋·푸시가 표준 workflow 입니다.

- 사용자가 "커밋해줘" / "푸시해줘" / "커밋하고 푸시해줘" 라고 말하면,
  별도 확인 없이 `master` 브랜치에 직접 커밋·푸시하는 의도로 해석합니다.
- 별도 feature 브랜치 생성이나 PR 을 요구하지 마세요 (오버헤드 증가).
- 다만 destructive 작업 (force push, reset --hard, 과거 커밋 amend 후 push 등)
  은 여전히 명시적 확인 필요합니다.
- 커밋 메시지는 한국어로 작성하며, 기존 커밋 스타일 (`feat(scope): ...`,
  `fix(scope): ...`, `chore(scope): ...`) 을 따릅니다.
