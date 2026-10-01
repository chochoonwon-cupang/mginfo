"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminTitleWithHelp } from "@/components/admin/AdminHelpTip";
import type { AdVendor } from "@/lib/types";
import type { Animal, ProjectExample, VendorProfile, VendorProfileStore } from "@/lib/vendor-profile-types";

type FactRow = { key: string; label: string; value: string };

function VerifiedHelpBody() {
  return (
    <>
      <p>
        <strong>이건 뭔가요?</strong> 광고업체의 <em>검증된 확장 정보</em>입니다. 상호·전화·주소는
        「광고업체정보설정」에 두고, 여기에는 영업시간·사실·개체(분양)·시공 사례(철거)만 넣습니다. AI가 이
        내용을 만들어내지 않습니다.
      </p>
      <p>
        <strong>왜 필요한가요?</strong> 대량발행이 매장정보·방문안내·실제 개체·시공 사례 같은{" "}
        <em>고정 블록</em>을 글에 붙이려면 여기 데이터가 있어야 합니다. 없으면 그 블록은 빠집니다.
      </p>
      <ol>
        <li>먼저 「광고업체정보설정」에서 업체(상호·전화·주소)를 등록합니다.</li>
        <li>
          이 화면에서 업체를 고른 뒤 업종을 선택합니다.
          <br />
          분양: 강아지 분양 · 철거: 철거
        </li>
        <li>영업시간·상담 방식·방문 정책·서비스·사실을 채우고 「프로필 저장」합니다.</li>
        <li>
          사실은 한 줄에 <code>키|이름|값</code> 형식입니다.
          <br />
          예: <code>years_in_business|운영 경력|20년 이상</code>
        </li>
        <li>분양 사이트면 「실제 개체」에 품종을 넣어 추가합니다. (키워드 품종과 맞아야 글에 나옵니다)</li>
        <li>철거 사이트면 「시공 사례」에 제목·유형·지역을 넣어 추가합니다.</li>
        <li>대량발행 그룹에 그 업체를 연결해 두면, 자동/수동 생성 때 검증 블록이 자동으로 붙습니다.</li>
      </ol>
      <p>
        <strong>주의</strong> · 허위 전화·주소·개체·사례를 넣지 마세요. · 상호/전화는 여기가 아니라
        「광고업체정보설정」에 있어야 매장 블록이 됩니다. · 개체는 추가 시 항상 「분양 가능」 상태입니다.
      </p>
    </>
  );
}

export function VendorVerifiedAdmin() {
  const [vendors, setVendors] = useState<AdVendor[]>([]);
  const [store, setStore] = useState<VendorProfileStore | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [businessHours, setBusinessHours] = useState("");
  const [consultationMethods, setConsultationMethods] = useState("");
  const [visitPolicy, setVisitPolicy] = useState("");
  const [industryId, setIndustryId] = useState("");
  const [factsText, setFactsText] = useState("");
  const [servicesText, setServicesText] = useState("");

  const [animalBreed, setAnimalBreed] = useState("포메라니안");
  const [animalName, setAnimalName] = useState("");
  const [animalSex, setAnimalSex] = useState("");
  const [animalBirth, setAnimalBirth] = useState("");

  const [projectTitle, setProjectTitle] = useState("");
  const [projectType, setProjectType] = useState("상가철거");
  const [projectRegion, setProjectRegion] = useState("");

  const load = useCallback(async () => {
    setError("");
    const [vRes, pRes] = await Promise.all([fetch("/api/ad-vendors"), fetch("/api/vendor-profiles")]);
    const vData = await vRes.json().catch(() => ({}));
    const pData = await pRes.json().catch(() => ({}));
    if (!vRes.ok) {
      setError(vData.error || "업체 목록 실패");
      return;
    }
    if (!pRes.ok) {
      setError(pData.error || "업체 검증 데이터 실패");
      return;
    }
    const list = (vData.vendors || []) as AdVendor[];
    setVendors(list);
    setStore(pData.store as VendorProfileStore);
    if (!vendorId && list[0]) setVendorId(list[0].id);
  }, [vendorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const profile: VendorProfile | null = useMemo(() => {
    if (!store || !vendorId) return null;
    return store.profiles.find((p) => p.vendorId === vendorId) || null;
  }, [store, vendorId]);

  const animals: Animal[] = useMemo(
    () => (store && vendorId ? store.animals.filter((a) => a.vendorId === vendorId) : []),
    [store, vendorId]
  );
  const projects: ProjectExample[] = useMemo(
    () => (store && vendorId ? store.projectExamples.filter((p) => p.vendorId === vendorId) : []),
    [store, vendorId]
  );

  useEffect(() => {
    if (!profile) {
      setBusinessHours("");
      setConsultationMethods("");
      setVisitPolicy("");
      setIndustryId("");
      setFactsText("");
      setServicesText("");
      return;
    }
    setBusinessHours(profile.businessHours || "");
    setIndustryId(profile.industryId || "");
    const methods = profile.industryData?.consultationMethods;
    setConsultationMethods(Array.isArray(methods) ? methods.join(", ") : String(methods || ""));
    setVisitPolicy(String(profile.industryData?.visitPolicy || ""));
    setFactsText(
      profile.verifiedFacts
        .map((f) => `${f.key}|${f.label}|${Array.isArray(f.value) ? f.value.join("/") : f.value}`)
        .join("\n")
    );
    setServicesText(profile.services.join(", "));
  }, [profile]);

  async function put(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/vendor-profiles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "저장 실패");
        return;
      }
      if (data.store) setStore(data.store as VendorProfileStore);
      else await load();
    } finally {
      setBusy(false);
    }
  }

  function parseFacts(text: string): FactRow[] {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, label, value] = line.split("|").map((s) => s.trim());
        return { key: key || "fact", label: label || key || "항목", value: value || "" };
      })
      .filter((f) => f.value);
  }

  const vendor = vendors.find((v) => v.id === vendorId);

  return (
    <div className="admin-stack">
      <div className="admin-card">
        <div className="admin-card-head">
          <div>
            <AdminTitleWithHelp title="업체 검증 데이터" helpTitle="업체 검증 데이터 사용법">
              <VerifiedHelpBody />
            </AdminTitleWithHelp>
            <p className="admin-muted">
              상호·전화·주소는 「광고업체정보설정」을 씁니다. 여기서는 영업시간·사실·개체·시공 사례만 확장합니다.
              노란색 ? 를 누르면 자세한 사용법이 나옵니다.
            </p>
          </div>
        </div>
        {error ? <p className="admin-error">{error}</p> : null}
        <div className="admin-form">
          <label>
            업체 선택
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              {!vendors.length ? <option value="">업체 없음</option> : null}
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {vendor ? (
          <p className="admin-muted admin-meta-line">
            연결: {vendor.name} · {vendor.phone || "전화 없음"} · {vendor.address || "주소 없음"}
          </p>
        ) : null}
      </div>

      <div className="admin-card">
        <div className="admin-card-head">
          <h2>기본 검증 확장</h2>
        </div>
        <div className="admin-form">
          <div className="admin-form-grid">
            <label>
              업종
              <select value={industryId} onChange={(e) => setIndustryId(e.target.value)}>
                <option value="">선택</option>
                <option value="ind-dog-adoption">강아지 분양</option>
                <option value="ind-demolition">철거</option>
              </select>
            </label>
            <label>
              영업시간
              <input
                value={businessHours}
                onChange={(e) => setBusinessHours(e.target.value)}
                placeholder="평일 10:00-19:00"
              />
            </label>
            <label>
              상담 방식 (쉼표)
              <input
                value={consultationMethods}
                onChange={(e) => setConsultationMethods(e.target.value)}
                placeholder="방문상담, 전화상담"
              />
            </label>
            <label>
              방문 정책
              <input
                value={visitPolicy}
                onChange={(e) => setVisitPolicy(e.target.value)}
                placeholder="예약제"
              />
            </label>
          </div>
          <label>
            서비스 (쉼표)
            <input value={servicesText} onChange={(e) => setServicesText(e.target.value)} />
          </label>
          <label>
            검증 사실 (한 줄에 키|이름|값)
            <textarea
              rows={4}
              value={factsText}
              onChange={(e) => setFactsText(e.target.value)}
              placeholder={"years_in_business|운영 경력|20년 이상\nspecialty|주요 취급 품종|포메라니안/말티푸"}
            />
          </label>
          <div className="admin-form-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !vendorId}
              onClick={() => {
                const facts = parseFacts(factsText).map((f) => ({
                  key: f.key,
                  label: f.label,
                  value: f.value.includes("/") ? f.value.split("/").map((s) => s.trim()) : f.value,
                  verified: true,
                  verifiedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }));
                const methods = consultationMethods
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                void put({
                  action: "upsertProfile",
                  vendorId,
                  industryId: industryId || undefined,
                  businessHours: businessHours || undefined,
                  services: servicesText
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  verifiedFacts: facts,
                  industryData: {
                    consultationMethods: methods,
                    visitPolicy: visitPolicy || undefined,
                  },
                });
              }}
            >
              프로필 저장
            </button>
          </div>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-head">
          <h2>실제 개체 (강아지분양)</h2>
        </div>
        <div className="admin-form">
          <div className="admin-inline-fields">
            <label>
              품종
              <input value={animalBreed} onChange={(e) => setAnimalBreed(e.target.value)} />
            </label>
            <label>
              이름
              <input value={animalName} onChange={(e) => setAnimalName(e.target.value)} placeholder="선택" />
            </label>
            <label>
              성별
              <input value={animalSex} onChange={(e) => setAnimalSex(e.target.value)} />
            </label>
            <label>
              생년월일
              <input value={animalBirth} onChange={(e) => setAnimalBirth(e.target.value)} />
            </label>
            <div className="admin-inline-submit">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !vendorId || !animalBreed.trim()}
                onClick={() =>
                  void put({
                    action: "upsertAnimal",
                    vendorId,
                    breed: animalBreed.trim(),
                    name: animalName.trim() || undefined,
                    sex: animalSex.trim() || undefined,
                    birthDate: animalBirth.trim() || undefined,
                    species: "dog",
                    status: "available",
                    media: [],
                  })
                }
              >
                개체 추가
              </button>
            </div>
          </div>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-table catalog-table">
            <thead>
              <tr>
                <th>품종</th>
                <th>이름</th>
                <th>성별</th>
                <th>생년월일</th>
                <th className="col-status">상태</th>
                <th className="col-actions">관리</th>
              </tr>
            </thead>
            <tbody>
              {animals.map((a) => (
                <tr key={a.id}>
                  <td data-label="품종">{a.breed}</td>
                  <td data-label="이름">{a.name || "—"}</td>
                  <td data-label="성별">{a.sex || "—"}</td>
                  <td data-label="생년월일">{a.birthDate || "—"}</td>
                  <td data-label="상태">
                    <span className="badge badge-on">
                      {a.status === "available"
                        ? "분양 가능"
                        : a.status === "reserved"
                          ? "예약됨"
                          : a.status === "completed"
                            ? "분양 완료"
                            : a.status === "inactive"
                              ? "비활성"
                              : a.status}
                    </span>
                  </td>
                  <td data-label="관리" className="admin-table-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() => void put({ action: "deleteAnimal", id: a.id })}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
              {!animals.length ? (
                <tr>
                  <td colSpan={6} className="admin-muted">
                    등록된 개체 없음
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-head">
          <h2>실제 시공 사례 (철거)</h2>
        </div>
        <div className="admin-form">
          <div className="admin-inline-fields">
            <label>
              제목
              <input value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)} />
            </label>
            <label>
              유형
              <input value={projectType} onChange={(e) => setProjectType(e.target.value)} />
            </label>
            <label>
              지역
              <input value={projectRegion} onChange={(e) => setProjectRegion(e.target.value)} />
            </label>
            <div className="admin-inline-submit">
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !vendorId || !projectTitle.trim()}
                onClick={() =>
                  void put({
                    action: "upsertProject",
                    vendorId,
                    title: projectTitle.trim(),
                    projectType: projectType.trim() || undefined,
                    region: projectRegion.trim() || undefined,
                    media: [],
                  })
                }
              >
                사례 추가
              </button>
            </div>
          </div>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-table catalog-table">
            <thead>
              <tr>
                <th>제목</th>
                <th>유형</th>
                <th>지역</th>
                <th className="col-actions">관리</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td data-label="제목">{p.title}</td>
                  <td data-label="유형">{p.projectType || "—"}</td>
                  <td data-label="지역">{p.region || "—"}</td>
                  <td data-label="관리" className="admin-table-actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() => void put({ action: "deleteProject", id: p.id })}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
              {!projects.length ? (
                <tr>
                  <td colSpan={4} className="admin-muted">
                    등록된 사례 없음
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
