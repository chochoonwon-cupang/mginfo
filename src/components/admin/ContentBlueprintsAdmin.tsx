"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminTitleWithHelp } from "@/components/admin/AdminHelpTip";
import type {
  CatalogStatus,
  ContentBlueprintStore,
  Industry,
} from "@/lib/content-blueprint-types";

const STATUS_OPTIONS: CatalogStatus[] = ["active", "draft", "disabled"];

const STATUS_LABEL: Record<CatalogStatus, string> = {
  active: "사용 중",
  draft: "작성 중",
  disabled: "사용 안 함",
};

function BlueprintHelpBody() {
  return (
    <>
      <p>
        <strong>이건 뭔가요?</strong> 업종별 <em>글 재료 풀</em>입니다. 고정 목차가 아니라, 글 설계 AI가
        키워드마다 블록·앵글·페이지 유형을 골라 조합합니다.
      </p>
      <ol>
        <li>
          <strong>새 업종 추가</strong>로 업종을 만들면, 기본 Blueprint·블록이 함께 생깁니다. (처음엔 「작성
          중」)
        </li>
        <li>아래에서 블록을 직접 추가하거나, 「이 업종용 초안 만들기」로 Gemini DRAFT를 받을 수 있습니다.</li>
        <li>Blueprint 카드에서 블록을 넣고/빼기 한 뒤, Blueprint·블록을 「사용 중」으로 바꿉니다.</li>
        <li>업체 전화·주소 등은 「업체 검증 데이터」에서 따로 관리합니다.</li>
      </ol>
    </>
  );
}

function statusBadgeClass(status: CatalogStatus) {
  if (status === "active") return "badge badge-on";
  if (status === "draft") return "badge badge-draft";
  return "badge badge-off";
}

function StatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: CatalogStatus;
  disabled?: boolean;
  onChange: (status: CatalogStatus) => void;
}) {
  return (
    <select
      className="catalog-status-select"
      value={value}
      disabled={disabled}
      aria-label="상태 변경"
      onChange={(e) => onChange(e.target.value as CatalogStatus)}
    >
      {STATUS_OPTIONS.map((status) => (
        <option key={status} value={status}>
          {STATUS_LABEL[status]}
        </option>
      ))}
    </select>
  );
}

function listToText(values?: string[]) {
  return (values || []).join(", ");
}

function suggestKey(name: string) {
  const map: Record<string, string> = {
    인테리어: "interior",
    미용: "beauty",
    맛집: "food",
    이사: "moving",
    청소: "cleaning",
    학원: "academy",
    병원: "clinic",
    부동산: "realty",
  };
  for (const [ko, en] of Object.entries(map)) {
    if (name.includes(ko)) return en;
  }
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 24);
}

function BlockAddForm({
  busy,
  defaultBlueprintId,
  onAdd,
}: {
  busy?: boolean;
  defaultBlueprintId: string;
  onAdd: (payload: {
    key: string;
    name: string;
    description: string;
    verifiedDataRequired: boolean;
    status: string;
    addToBlueprintId: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [verified, setVerified] = useState(false);
  const [addToBp, setAddToBp] = useState(true);

  return (
    <>
      <label>
        블록 이름
        <input
          value={name}
          disabled={busy}
          placeholder="예: 견적 비교 포인트"
          onChange={(e) => {
            const next = e.target.value;
            setName(next);
            if (!keyTouched) {
              setKey(
                next
                  .trim()
                  .toLowerCase()
                  .replace(/\s+/g, "_")
                  .replace(/[^a-z0-9_]/g, "")
                  .slice(0, 32)
              );
            }
          }}
        />
      </label>
      <label>
        식별키 (영문)
        <input
          value={key}
          disabled={busy}
          placeholder="estimate_tips"
          onChange={(e) => {
            setKeyTouched(true);
            setKey(e.target.value);
          }}
        />
      </label>
      <label>
        설명
        <input
          value={description}
          disabled={busy}
          placeholder="이 섹션이 다루는 내용"
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label className="admin-check-all">
        <input type="checkbox" checked={verified} disabled={busy} onChange={(e) => setVerified(e.target.checked)} />
        <span>검증데이터 필수 (업체 사실이 있을 때만 글에 넣음)</span>
      </label>
      {defaultBlueprintId ? (
        <label className="admin-check-all">
          <input type="checkbox" checked={addToBp} disabled={busy} onChange={(e) => setAddToBp(e.target.checked)} />
          <span>현재 Blueprint에도 바로 넣기</span>
        </label>
      ) : null}
      <div className="admin-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !name.trim() || !key.trim()}
          onClick={() => {
            onAdd({
              key: key.trim(),
              name: name.trim(),
              description: description.trim(),
              verifiedDataRequired: verified,
              status: "draft",
              addToBlueprintId: addToBp ? defaultBlueprintId : "",
            });
            setName("");
            setKey("");
            setKeyTouched(false);
            setDescription("");
            setVerified(false);
          }}
        >
          블록 추가
        </button>
      </div>
    </>
  );
}

type HintsPayload = {
  name: string;
  description: string;
  keywords: string;
  aliases: string;
  serviceTerms: string;
  negativeTerms: string;
};

function IndustryEditForm({
  industry,
  busy,
  onSave,
  onStatus,
}: {
  industry: Industry;
  busy?: boolean;
  onSave: (payload: HintsPayload) => void;
  onStatus: (status: CatalogStatus) => void;
}) {
  const [name, setName] = useState(industry.name);
  const [description, setDescription] = useState(industry.description || "");
  const [keywords, setKeywords] = useState(listToText(industry.resolverHints?.keywords));
  const [aliases, setAliases] = useState(listToText(industry.resolverHints?.aliases));
  const [serviceTerms, setServiceTerms] = useState(listToText(industry.resolverHints?.serviceTerms));
  const [negativeTerms, setNegativeTerms] = useState(listToText(industry.resolverHints?.negativeTerms));

  useEffect(() => {
    setName(industry.name);
    setDescription(industry.description || "");
    setKeywords(listToText(industry.resolverHints?.keywords));
    setAliases(listToText(industry.resolverHints?.aliases));
    setServiceTerms(listToText(industry.resolverHints?.serviceTerms));
    setNegativeTerms(listToText(industry.resolverHints?.negativeTerms));
  }, [industry]);

  return (
    <div className="admin-form industry-edit-form">
      <div className="industry-meta-row">
        <div>
          <span className="industry-meta-label">업종 ID</span>
          <code>{industry.id}</code>
        </div>
        <div>
          <span className="industry-meta-label">영문 키</span>
          <code>{industry.key}</code>
        </div>
        <div className="admin-status-control">
          <span className={statusBadgeClass(industry.status)}>{STATUS_LABEL[industry.status]}</span>
          <StatusSelect value={industry.status} disabled={busy} onChange={onStatus} />
        </div>
      </div>

      <label>
        업종명
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="예: 인테리어" />
      </label>
      <label>
        설명
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          placeholder="한 줄로 업종 설명"
        />
      </label>

      <h3 className="admin-subhead">키워드 자동 매칭</h3>
      <p className="field-hint">쉼표로 여러 개 입력합니다. 글 키워드에 포함되면 이 업종으로 연결됩니다.</p>

      <label>
        기본 키워드
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          disabled={busy}
          placeholder="예: 인테리어, 리모델링"
        />
      </label>
      <label>
        별칭
        <input
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          disabled={busy}
          placeholder="예: 집꾸미기"
        />
      </label>
      <label>
        강한 매칭어 (서비스 용어)
        <input
          value={serviceTerms}
          onChange={(e) => setServiceTerms(e.target.value)}
          disabled={busy}
          placeholder="예: 올수리, 부분공사"
        />
      </label>
      <label>
        제외 단어
        <input
          value={negativeTerms}
          onChange={(e) => setNegativeTerms(e.target.value)}
          disabled={busy}
          placeholder="예: 맛집, 카페 (이 단어가 있으면 매칭 안 함)"
        />
      </label>

      <div className="admin-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !name.trim()}
          onClick={() =>
            onSave({
              name,
              description,
              keywords,
              aliases,
              serviceTerms,
              negativeTerms,
            })
          }
        >
          업종 정보 저장
        </button>
      </div>
    </div>
  );
}

function NewIndustryForm({
  busy,
  onCreate,
  onCancel,
}: {
  busy?: boolean;
  onCreate: (payload: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [aliases, setAliases] = useState("");
  const [serviceTerms, setServiceTerms] = useState("");
  const [negativeTerms, setNegativeTerms] = useState("");

  return (
    <div className="admin-form industry-create-form">
      <p className="field-hint">
        업종을 만들면 기본 Blueprint·블록(개요·체크리스트·팁·FAQ)이 「작성 중」으로 함께 생깁니다. 매칭어를
        채운 뒤 Blueprint를 「사용 중」으로 바꾸면 Bulk·새글작성·자유게시판에서 쓸 수 있습니다.
      </p>
      <label>
        업종명 <em>(필수)</em>
        <input
          value={name}
          onChange={(e) => {
            const next = e.target.value;
            setName(next);
            if (!keyTouched) setKey(suggestKey(next));
          }}
          disabled={busy}
          placeholder="예: 인테리어"
        />
      </label>
      <label>
        영문 키 <em>(필수, 소문자·하이픈)</em>
        <input
          value={key}
          onChange={(e) => {
            setKeyTouched(true);
            setKey(e.target.value);
          }}
          disabled={busy}
          placeholder="예: interior"
        />
      </label>
      <label>
        설명
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          placeholder="선택 사항"
        />
      </label>
      <label>
        기본 키워드
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          disabled={busy}
          placeholder="예: 인테리어, 리모델링"
        />
      </label>
      <label>
        별칭
        <input value={aliases} onChange={(e) => setAliases(e.target.value)} disabled={busy} />
      </label>
      <label>
        강한 매칭어
        <input value={serviceTerms} onChange={(e) => setServiceTerms(e.target.value)} disabled={busy} />
      </label>
      <label>
        제외 단어
        <input value={negativeTerms} onChange={(e) => setNegativeTerms(e.target.value)} disabled={busy} />
      </label>
      <div className="admin-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !name.trim() || !key.trim()}
          onClick={() =>
            onCreate({
              name: name.trim(),
              key: key.trim(),
              description: description.trim(),
              keywords,
              aliases,
              serviceTerms,
              negativeTerms,
              status: "draft",
            })
          }
        >
          업종 만들기
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  );
}

export function ContentBlueprintsAdmin() {
  const [store, setStore] = useState<ContentBlueprintStore | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [openIndustry, setOpenIndustry] = useState<string>("");
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const res = await fetch("/api/ops/blueprints");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "불러오지 못했습니다.");
      return;
    }
    setStore(data.store as ContentBlueprintStore);
    const first = (data.store as ContentBlueprintStore)?.industries?.[0]?.id || "";
    setOpenIndustry((prev) => prev || first);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/ops/blueprints", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "저장 실패");
        return null;
      }
      if (data.store) setStore(data.store as ContentBlueprintStore);
      else await load();
      return data;
    } finally {
      setBusy(false);
    }
  }

  const industry = useMemo(
    () => store?.industries.find((row) => row.id === openIndustry) || store?.industries[0] || null,
    [store, openIndustry]
  );

  const blueprints = useMemo(
    () => (store && industry ? store.blueprints.filter((row) => row.industryId === industry.id) : []),
    [store, industry]
  );
  const blocks = useMemo(
    () => (store && industry ? store.blocks.filter((row) => row.industryId === industry.id) : []),
    [store, industry]
  );
  const pageTypes = useMemo(
    () => (store && industry ? store.pageTypes.filter((row) => row.industryId === industry.id) : []),
    [store, industry]
  );
  const angles = useMemo(
    () => (store && industry ? store.angles.filter((row) => row.industryId === industry.id) : []),
    [store, industry]
  );

  if (!store) {
    return (
      <div className="admin-stack">
        <div className="admin-card">
          <p className="admin-muted">{error || "글 구성 재료를 불러오는 중…"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-stack">
      <div className="admin-card">
        <div className="admin-card-head">
          <div>
            <AdminTitleWithHelp title="글 구성 재료" helpTitle="글 구성 재료 사용법">
              <BlueprintHelpBody />
            </AdminTitleWithHelp>
            <p className="admin-muted">업종 · Blueprint · 블록을 한곳에서 관리합니다.</p>
          </div>
          <div className="admin-head-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                setShowCreate(true);
                setMessage("");
                setError("");
              }}
            >
              새 업종 추가
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void load()}>
              새로고침
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                if (!confirm("시드(강아지분양·철거)로 초기화할까요? 직접 추가한 업종·상태 변경이 사라집니다.")) {
                  return;
                }
                void patch({ action: "resetSeed" });
              }}
            >
              시드로 초기화
            </button>
          </div>
        </div>
        <p className="admin-muted admin-meta-line">
          저장 위치: 허브 · 업종 {store.industries.length}개 · 예외 설정 {store.overrides.length}개
        </p>
        {error ? <p className="admin-error">{error}</p> : null}
        {message ? <p className="admin-ok">{message}</p> : null}

        <div className="admin-segment" role="tablist" aria-label="업종">
          {store.industries.map((row) => (
            <button
              key={row.id}
              type="button"
              role="tab"
              aria-selected={row.id === industry?.id}
              className={row.id === industry?.id ? "is-active" : ""}
              onClick={() => {
                setOpenIndustry(row.id);
                setShowCreate(false);
              }}
            >
              {row.name}
              <span className={statusBadgeClass(row.status)}>{STATUS_LABEL[row.status]}</span>
            </button>
          ))}
        </div>
      </div>

      {showCreate ? (
        <div className="admin-card industry-create-card">
          <div className="admin-card-head">
            <h2>새 업종 추가</h2>
          </div>
          <NewIndustryForm
            busy={busy}
            onCancel={() => setShowCreate(false)}
            onCreate={(payload) => {
              void (async () => {
                const data = await patch({
                  action: "upsertIndustry",
                  ...payload,
                  withStarterPack: true,
                });
                if (!data?.ok) return;
                const createdId = data.industry?.id as string | undefined;
                setShowCreate(false);
                setMessage(
                  data.created
                    ? `「${payload.name}」 업종과 기본 Blueprint를 만들었습니다. Blueprint를 「사용 중」으로 바꾸면 글 생성에 쓰입니다.`
                    : `「${payload.name}」 업종 정보를 갱신했습니다.`
                );
                if (createdId) setOpenIndustry(createdId);
              })();
            }}
          />
        </div>
      ) : null}

      {industry && !showCreate ? (
        <div className="admin-card">
          <div className="admin-card-head">
            <div>
              <h2>{industry.name}</h2>
              <p className="admin-muted">업종 정보와 키워드 매칭을 수정합니다.</p>
            </div>
          </div>
          <IndustryEditForm
            key={industry.id}
            industry={industry}
            busy={busy}
            onStatus={(status) => void patch({ action: "setIndustryStatus", industryId: industry.id, status })}
            onSave={(payload) => {
              void (async () => {
                const data = await patch({
                  action: "updateIndustryHints",
                  industryId: industry.id,
                  ...payload,
                });
                if (data?.ok) setMessage("업종 정보를 저장했습니다.");
              })();
            }}
          />
        </div>
      ) : null}

      {!showCreate &&
        blueprints.map((bp) => (
          <div className="admin-card" key={bp.id}>
            <div className="admin-card-head">
              <div>
                <h2>
                  {bp.name}{" "}
                  <span className="admin-key">
                    <code>{bp.key}</code>
                  </span>
                </h2>
                <p className="admin-muted">
                  v{bp.version} · 블록 {bp.blockKeys.length} · 유형 {bp.pageTypeKeys.length} · 앵글{" "}
                  {bp.angleKeys.length}
                </p>
              </div>
              <div className="admin-status-control">
                <span className={statusBadgeClass(bp.status)}>{STATUS_LABEL[bp.status]}</span>
                <StatusSelect
                  value={bp.status}
                  disabled={busy}
                  onChange={(status) => void patch({ action: "setBlueprintStatus", blueprintId: bp.id, status })}
                />
              </div>
            </div>
            {bp.description ? <p className="admin-muted">{bp.description}</p> : null}
            {industry ? (
              <div className="blueprint-block-pick">
                <h3 className="admin-subhead">Blueprint에 넣을 블록</h3>
                <p className="field-hint">체크한 블록만 이 Blueprint 재료로 씁니다.</p>
                <div className="blueprint-block-checks">
                  {blocks.map((row) => {
                    const checked = bp.blockKeys.includes(row.key);
                    return (
                      <label key={row.id} className="admin-check-all">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy}
                          onChange={() => {
                            const next = checked
                              ? bp.blockKeys.filter((k) => k !== row.key)
                              : [...bp.blockKeys, row.key];
                            void (async () => {
                              const data = await patch({
                                action: "setBlueprintBlockKeys",
                                blueprintId: bp.id,
                                blockKeys: next,
                              });
                              if (data?.ok) setMessage("Blueprint 블록 구성을 저장했습니다.");
                            })();
                          }}
                        />
                        <span>
                          {row.name} <code>{row.key}</code>
                        </span>
                      </label>
                    );
                  })}
                  {!blocks.length ? <p className="admin-muted">블록이 없습니다. 아래에서 추가하세요.</p> : null}
                </div>
              </div>
            ) : null}
          </div>
        ))}

      {!showCreate && industry && !blueprints.length ? (
        <div className="admin-card">
          <p className="admin-muted">
            이 업종에 Blueprint가 없습니다. 「새 업종 추가」로 만들면 기본 재료가 함께 생성됩니다.
          </p>
        </div>
      ) : null}

      {!showCreate && industry ? (
        <div className="admin-card">
          <div className="admin-card-head">
            <div>
              <h2>콘텐츠 블록 ({blocks.length})</h2>
              <p className="admin-muted">풀의 재료입니다. 페이지마다 전부 쓰이지 않습니다.</p>
            </div>
            <div className="admin-head-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    !confirm(
                      `「${industry.name}」용 블록 초안을 Gemini로 만들까요? DRAFT로만 저장되며, 검토 후 「사용 중」으로 바꾸면 됩니다.`
                    )
                  ) {
                    return;
                  }
                  void (async () => {
                    const data = await patch({
                      action: "draftIndustryPack",
                      industryId: industry.id,
                      blueprintId: blueprints[0]?.id,
                    });
                    if (!data?.ok) return;
                    const added = data.added as { blocks?: number; angles?: number } | undefined;
                    setMessage(
                      `초안 저장: 블록 ${added?.blocks || 0}개 · 앵글 ${added?.angles || 0}개 (작성 중). 필요하면 「사용 중」으로 바꾸세요.`
                    );
                  })();
                }}
              >
                이 업종용 초안 만들기
              </button>
            </div>
          </div>

          <div className="admin-form industry-edit-form" style={{ marginBottom: 20 }}>
            <h3 className="admin-subhead">블록 직접 추가</h3>
            <BlockAddForm
              busy={busy}
              defaultBlueprintId={blueprints[0]?.id || ""}
              onAdd={(payload) => {
                void (async () => {
                  const data = await patch({
                    action: "upsertBlock",
                    industryId: industry.id,
                    ...payload,
                  });
                  if (data?.ok) setMessage(`블록 「${payload.name}」을 추가했습니다.`);
                })();
              }}
            />
          </div>

          <div className="admin-table-scroll">
            <table className="admin-table catalog-table">
              <thead>
                <tr>
                  <th className="col-key">식별키</th>
                  <th>이름 / 설명</th>
                  <th className="col-flag">검증데이터</th>
                  <th className="col-status">상태</th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((row) => (
                  <tr key={row.id}>
                    <td data-label="식별키">
                      <code>{row.key}</code>
                    </td>
                    <td data-label="이름">
                      <div className="catalog-name">{row.name}</div>
                      {row.description ? <div className="admin-muted catalog-desc">{row.description}</div> : null}
                    </td>
                    <td data-label="검증데이터">{row.verifiedDataRequired ? "필수" : "—"}</td>
                    <td data-label="상태" className="admin-table-actions">
                      <div className="admin-status-control">
                        <span className={statusBadgeClass(row.status)}>{STATUS_LABEL[row.status]}</span>
                        <StatusSelect
                          value={row.status}
                          disabled={busy}
                          onChange={(status) => void patch({ action: "setBlockStatus", blockId: row.id, status })}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {!blocks.length ? (
                  <tr>
                    <td colSpan={4} className="admin-muted">
                      블록 없음
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {!showCreate ? (
        <div className="admin-card">
          <div className="admin-card-head">
            <h2>페이지 유형 ({pageTypes.length})</h2>
          </div>
          <div className="admin-table-scroll">
            <table className="admin-table catalog-table">
              <thead>
                <tr>
                  <th className="col-key">key</th>
                  <th>이름 / 설명</th>
                  <th className="col-status">상태</th>
                </tr>
              </thead>
              <tbody>
                {pageTypes.map((row) => (
                  <tr key={row.id}>
                    <td data-label="key">
                      <code>{row.key}</code>
                    </td>
                    <td data-label="이름">
                      <div className="catalog-name">{row.name}</div>
                      {row.description ? <div className="admin-muted catalog-desc">{row.description}</div> : null}
                    </td>
                    <td data-label="상태" className="admin-table-actions">
                      <span className={statusBadgeClass(row.status)}>{STATUS_LABEL[row.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {!showCreate ? (
        <div className="admin-card">
          <div className="admin-card-head">
            <h2>글 앵글 ({angles.length})</h2>
          </div>
          <div className="admin-table-scroll">
            <table className="admin-table catalog-table">
              <thead>
                <tr>
                  <th className="col-key">key</th>
                  <th>이름 / 설명</th>
                  <th className="col-status">상태</th>
                </tr>
              </thead>
              <tbody>
                {angles.map((row) => (
                  <tr key={row.id}>
                    <td data-label="key">
                      <code>{row.key}</code>
                    </td>
                    <td data-label="이름">
                      <div className="catalog-name">{row.name}</div>
                      {row.description ? <div className="admin-muted catalog-desc">{row.description}</div> : null}
                    </td>
                    <td data-label="상태" className="admin-table-actions">
                      <span className={statusBadgeClass(row.status)}>{STATUS_LABEL[row.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
