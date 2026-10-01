import Link from "next/link";

export const dynamic = "force-dynamic";

export default function DevSamplesIndex() {
  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: 720 }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>메인랜딩 샘플 (로컬 개발)</h1>
      <p style={{ color: "#555", marginBottom: "1.5rem" }}>
        브랜드 스튜디오 디자인 미리보기 · 블로그는 <Link href="/posts">/posts</Link>
      </p>
      <ul style={{ lineHeight: 2 }}>
        <li>
          <Link href="/dev/samples/scalp-tattoo-v1">두피문신 (scalp-tattoo-v1)</Link>
        </li>
        <li>
          <Link href="/dev/samples/demolition-v1">폐업·철거 · 부천철거 (demolition-v1)</Link>
        </li>
        <li>
          <Link href="/dev/samples/demolition-v1?keyword=시흥철거">폐업·철거 · 시흥철거 (색·배치 다름)</Link>
        </li>
        <li>
          <Link href="/dev/samples/demolition-v1?keyword=인천철거">폐업·철거 · 인천철거 (색·배치 다름)</Link>
        </li>
      </ul>
      <p style={{ marginTop: "2rem", fontSize: "0.9rem", color: "#888" }}>
        프로덕션에서는 도메인(Host)별 <code>hostProfiles</code> 로 같은 디자인이 키워드마다 다르게
        보입니다.
      </p>
    </div>
  );
}
