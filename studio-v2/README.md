# Infocs Brand Studio (v2)

PC 앱 **Infocs Brand Studio** — apex당 Vercel **프로젝트 하나**에 키워드 서브도메인을 붙이고, 도메인별 메인(두피문신)만 다르게 둡니다. 블로그 글은 배포 사이트에서 공용입니다.

- appId: `co.infocs.studio.brand`
- 출력: `../사이트만들기-브랜드/InfocsBrandStudio.exe`
- ops 사이트 대장(`/api/ops/sites`) **미사용** — 로컬 대장만

## 사용

1. `cd studio-v2 && npm install && npm start`
2. **계정 설정**: Vercel 토큰(chochoonwon-cupang) · Team `coupangs-projects` · GitHub `chochoonwon-cupang/mginfo` · 허브 `https://mginfo-phi.vercel.app` · 마스터 비번 · **Gemini API Key**
3. **구성·발행**: apex · 키워드 목록 · 업체 최소정보 · 메인/블로그 디자인 → **대량 사이트 발행**
4. 배포된 코드에 `/api/brand-studio/bootstrap`이 있어야 메인랜딩이 자동 적용됩니다 (이 저장소 main 배포 후).
   Studio에 넣은 제미나이 키가 각 사이트에 심기고, bootstrap이 **내용 보충**으로 사이트마다 문장을 다르게 씁니다.

```bash
npm run dist
```
