import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { callTool, notifyIntrinsicHeight, setWidgetState, uploadFile } from "../bridge";
import { Badge, Button, Card, EmptyState, ErrorState, Field, ProgressBar, Stepper, SyntheticBadge } from "../components";
import { ConsentScreen, createEmptyConsent, getMissingRequiredConsents, type ConsentKey, type ConsentState } from "../consent";
import { GlobalStyles } from "../theme";
import "./styles.css";
import { ALL_PROFILE_QUESTIONS, PROFILE_QUESTIONS_SOURCE, QUESTION_SECTIONS, type ProfileQuestion, type QuestionSection } from "./questions";

type AnswerValue = string | string[];
type Answers = Record<string, AnswerValue>;

type PersonaSpec = {
  id: string;
  displayName: string;
  ageRange?: string;
  city?: string;
  district?: string;
  mbti?: string;
  values?: unknown;
  interests: string[];
  communicationStyle?: string;
  boundaries: string[];
  is_synthetic: boolean;
};

type PhotoState = {
  fileId?: string;
  fileName?: string;
  status: "idle" | "pending" | "unavailable" | "error";
};

type FormState = {
  step: number;
  birthYear: string;
  consent: ConsentState;
  answers: Answers;
  photo: PhotoState;
  persona?: PersonaSpec;
};

const STORAGE_KEY = "soulsync.profile-form.v1";
const CURRENT_YEAR = new Date().getFullYear();
const STEP_LABELS = ["나이", "동의", "MBTI", "가치관", "어필", "사진", "페르소나"];

const createInitialState = (): FormState => ({
  step: 0,
  birthYear: "",
  consent: createEmptyConsent(),
  answers: {},
  photo: { status: "idle" }
});

function readStoredState(): FormState {
  if (typeof window === "undefined") {
    return createInitialState();
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return createInitialState();
    }
    const parsed = JSON.parse(stored) as Partial<FormState>;
    return { ...createInitialState(), ...parsed, consent: { ...createEmptyConsent(), ...parsed.consent }, photo: parsed.photo ?? { status: "idle" } };
  } catch {
    return createInitialState();
  }
}

function hasUploadCapability() {
  return typeof window !== "undefined" && typeof window.openai?.uploadFile === "function";
}

function isAdult(birthYear: string) {
  const year = Number(birthYear);
  return Number.isInteger(year) && year >= 1900 && CURRENT_YEAR - year >= 18;
}

function adultError(birthYear: string) {
  if (!birthYear) {
    return undefined;
  }
  const year = Number(birthYear);
  if (!Number.isInteger(year) || year < 1900 || year > CURRENT_YEAR) {
    return "출생연도를 정확히 입력해 주세요.";
  }
  if (!isAdult(birthYear)) {
    return "SoulSync AI 온보딩은 만 18세 이상만 진행할 수 있어요.";
  }
  return undefined;
}

function sectionForStep(step: number): QuestionSection | undefined {
  return QUESTION_SECTIONS[step - 2];
}

function isQuestionAnswered(question: ProfileQuestion, answers: Answers) {
  const value = answers[question.id];
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return typeof value === "string" && value.trim().length > 0;
}

function sectionProgress(section: QuestionSection | undefined, answers: Answers) {
  if (!section) {
    return 100;
  }
  const answered = section.questions.filter((question) => isQuestionAnswered(question, answers)).length;
  return Math.round((answered / section.questions.length) * 100);
}

function answerSummary(answers: Answers) {
  const values = ALL_PROFILE_QUESTIONS.map((question) => answers[question.id]).filter(Boolean);
  return values.flatMap((value) => (Array.isArray(value) ? value : [value])).slice(0, 8);
}

function fallbackPersona(state: FormState): PersonaSpec {
  const location = String(state.answers.appeal_location ?? "");
  const [city, district] = location.split(" ");
  const interests = [state.answers.appeal_weekend, state.answers.appeal_communication, ...(Array.isArray(state.answers.appeal_hobbies) ? state.answers.appeal_hobbies : [])]
    .filter(Boolean)
    .map(String)
    .slice(0, 5);

  return {
    id: "preview-persona",
    displayName: "SoulSync 예비 프로필",
    ageRange: "만 18세 이상",
    city,
    district,
    interests,
    communicationStyle: String(state.answers.appeal_communication ?? "상대의 속도를 존중하며 대화"),
    boundaries: ["정확한 주소와 직장명은 공유하지 않기", "연 소득은 구간으로만 다루기"],
    is_synthetic: false
  };
}

function normalizePersona(result: unknown, state: FormState): PersonaSpec {
  const fallback = fallbackPersona(state);
  if (!result || typeof result !== "object") {
    return fallback;
  }
  const maybe = "structuredContent" in result ? (result as { structuredContent?: unknown }).structuredContent : result;
  if (!maybe || typeof maybe !== "object") {
    return fallback;
  }
  const persona = "persona" in maybe ? (maybe as { persona?: unknown }).persona : maybe;
  if (!persona || typeof persona !== "object") {
    return fallback;
  }
  const candidate = persona as Partial<PersonaSpec>;
  return {
    ...fallback,
    ...candidate,
    interests: Array.isArray(candidate.interests) ? candidate.interests.map(String) : fallback.interests,
    boundaries: Array.isArray(candidate.boundaries) ? candidate.boundaries.map(String) : fallback.boundaries,
    is_synthetic: Boolean(candidate.is_synthetic)
  };
}

function serializeState(state: FormState) {
  return {
    step: state.step,
    birthYear: state.birthYear,
    consent: state.consent,
    answers: state.answers,
    photo: state.photo,
    persona: state.persona
  };
}

function QuestionCard({ answers, question, onAnswer }: { answers: Answers; question: ProfileQuestion; onAnswer: (questionId: string, value: AnswerValue) => void }) {
  const value = answers[question.id];
  const selectedValues = Array.isArray(value) ? value : [];

  if (question.inputType === "text") {
    return (
      <Card className="ssw-question-card" padding="sm" shadow={false}>
        <Field
          helperText="정확한 주소, 직장명 등 식별 가능한 정보는 적지 말아 주세요."
          label={question.prompt}
          onChange={(event) => onAnswer(question.id, event.currentTarget.value)}
          placeholder="예: 차분한 산책과 깊은 대화를 좋아해요."
          textarea
          value={typeof value === "string" ? value : ""}
        />
      </Card>
    );
  }

  return (
    <Card className="ssw-question-card" padding="sm" shadow={false}>
      <div className="ssw-question-card__prompt">
        <strong>{question.prompt}</strong>
        <Badge text={question.privacyClass === "public" ? "공개 가능" : "매칭 전용"} variant="default" />
      </div>
      <div className="ssw-option-grid">
        {question.options?.map((option) => {
          const checked = question.inputType === "multi" ? selectedValues.includes(String(option.value)) : value === String(option.value);
          return (
            <label className="ssw-option" key={option.id}>
              <input
                checked={checked}
                name={question.id}
                onChange={(event) => {
                  if (question.inputType === "multi") {
                    const next = event.currentTarget.checked ? [...selectedValues, String(option.value)] : selectedValues.filter((item) => item !== String(option.value));
                    onAnswer(question.id, next);
                    return;
                  }
                  onAnswer(question.id, String(option.value));
                }}
                type={question.inputType === "multi" ? "checkbox" : "radio"}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </Card>
  );
}

export function ProfileFormWidget() {
  const [state, setState] = useState<FormState>(() => readStoredState());
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [personaEditing, setPersonaEditing] = useState(false);
  const [personaDraft, setPersonaDraft] = useState<PersonaSpec>();
  const currentSection = sectionForStep(state.step);
  const missingConsents = useMemo(() => getMissingRequiredConsents(state.consent), [state.consent]);
  const completion = Math.round(((state.step + 1) / STEP_LABELS.length) * 100);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState(state)));
    }
    setWidgetState(serializeState(state));
    notifyIntrinsicHeight(document.documentElement.scrollHeight);
  }, [state]);

  useEffect(() => {
    if (state.step === 6 && !state.persona && !saving) {
      if (!state.consent.aiPersonaGeneration) {
        const persona = fallbackPersona(state);
        setState((current) => ({ ...current, persona }));
        setPersonaDraft(persona);
        return;
      }
      void generatePersona(false);
    }
  }, [state.step]);

  async function persistStep(stepName: string, payload: unknown) {
    setSaving(true);
    setError(undefined);
    try {
      await callTool("save_profile_step", { step: stepName, payload });
    } catch (toolError) {
      setError(toolError instanceof Error ? toolError.message : "저장 중 문제가 발생했어요.");
      throw toolError;
    } finally {
      setSaving(false);
    }
  }

  async function persistConsent(consent: ConsentState) {
    setSaving(true);
    setError(undefined);
    try {
      await callTool("save_profile_consent", { consent, grantedAt: new Date().toISOString() });
    } catch (toolError) {
      setError(toolError instanceof Error ? toolError.message : "동의 저장 중 문제가 발생했어요.");
      throw toolError;
    } finally {
      setSaving(false);
    }
  }

  async function continueFromAge() {
    const message = adultError(state.birthYear);
    if (message) {
      setError(message);
      return;
    }
    await persistStep("age_gate", { birthYear: state.birthYear, ageGate: "adult" });
    setState((current) => ({ ...current, step: 1 }));
  }

  async function continueFromConsent() {
    await persistConsent(state.consent);
    setState((current) => ({ ...current, step: 2 }));
  }

  async function continueFromQuestions(section: QuestionSection) {
    const unanswered = section.questions.find((question) => !isQuestionAnswered(question, state.answers));
    if (unanswered) {
      setError(`아직 답하지 않은 문항이 있어요: ${unanswered.prompt}`);
      return;
    }
    const payload = Object.fromEntries(section.questions.map((question) => [question.id, state.answers[question.id]]));
    await persistStep(section.id, payload);
    setState((current) => ({ ...current, step: current.step + 1 }));
  }

  async function continueFromPhoto() {
    await persistStep("photo", state.photo);
    setState((current) => ({ ...current, step: 6 }));
  }

  async function generatePersona(markRegenerate: boolean) {
    if (!state.consent.aiPersonaGeneration) {
      const persona = fallbackPersona(state);
      setState((current) => ({ ...current, persona }));
      setPersonaDraft(persona);
      setError("AI 페르소나 생성 동의가 없어 새 페르소나를 생성하지 않았어요.");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const result = await callTool("generate_persona", {
        answers: state.answers,
        consent: state.consent,
        photoFileId: state.photo.fileId,
        regenerate: markRegenerate
      });
      const persona = normalizePersona(result, state);
      setState((current) => ({ ...current, persona }));
      setPersonaDraft(persona);
      setPersonaEditing(false);
      await callTool("save_profile_step", { step: "persona_preview", payload: { persona } });
    } catch (toolError) {
      const persona = fallbackPersona(state);
      setState((current) => ({ ...current, persona }));
      setPersonaDraft(persona);
      setError(toolError instanceof Error ? `${toolError.message} 페르소나 초안은 로컬 미리보기로 표시했어요.` : "페르소나 생성 도구 응답을 확인하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  async function savePersonaDraft() {
    if (!personaDraft) {
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await callTool("update_persona", { persona: personaDraft });
      await callTool("save_profile_step", { step: "persona_edit", payload: { persona: personaDraft } });
      setState((current) => ({ ...current, persona: personaDraft }));
      setPersonaEditing(false);
    } catch (toolError) {
      setError(toolError instanceof Error ? toolError.message : "페르소나 저장 중 문제가 발생했어요.");
    } finally {
      setSaving(false);
    }
  }

  async function activateMatching() {
    if (!isAdult(state.birthYear)) {
      setError("만 18세 이상 확인이 필요해요.");
      return;
    }
    if (missingConsents.length > 0) {
      setError(`${missingConsents[0]?.title} 동의가 필요해요.`);
      return;
    }
    await persistStep("activate_matching", { persona: state.persona, ready: true });
  }

  function renderAgeGate() {
    const message = adultError(state.birthYear);
    return (
      <Card footer="만 18세 미만은 온보딩을 진행할 수 없습니다." header={<Badge text="Step 0" variant="default" />}>
        <div className="ssw-profile-heading">
          <h2>먼저 나이를 확인할게요</h2>
          <p>출생연도만 입력해 주세요. 정확한 생년월일은 받지 않습니다.</p>
        </div>
        <Field
          error={message}
          inputMode="numeric"
          label="출생연도"
          max={CURRENT_YEAR}
          min={1900}
          onChange={(event) => {
            const birthYear = event.currentTarget.value;
            setError(undefined);
            setState((current) => ({ ...current, birthYear }));
          }}
          placeholder="예: 1995"
          type="number"
          value={state.birthYear}
        />
        {message && state.birthYear ? <p className="ssw-profile-alert" role="alert">{message}</p> : null}
        <div className="ssw-profile-actions">
          <Button disabled={!state.birthYear || Boolean(message) || saving} loading={saving} onClick={continueFromAge} size="lg">
            다음
          </Button>
        </div>
      </Card>
    );
  }

  function renderQuestions(section: QuestionSection) {
    return (
      <Card
        footer={`${section.questions.length}문항 모두 답하면 자동 저장 후 다음 단계로 이동합니다.`}
        header={<Badge text={PROFILE_QUESTIONS_SOURCE.loaded ? "content/questions.ts" : "질문 소스 확인 필요"} variant={PROFILE_QUESTIONS_SOURCE.loaded ? "success" : "error"} />}
      >
        <div className="ssw-profile-heading">
          <h2>{section.title}</h2>
          <p>{section.description}</p>
        </div>
        <ProgressBar label={`${section.shortTitle} 진행률`} value={sectionProgress(section, state.answers)} />
        <div className="ssw-question-list">
          {section.questions.map((question) => (
            <QuestionCard
              answers={state.answers}
              key={question.id}
              onAnswer={(questionId, value) => {
                setError(undefined);
                setState((current) => ({ ...current, answers: { ...current.answers, [questionId]: value } }));
              }}
              question={question}
            />
          ))}
        </div>
        <div className="ssw-profile-actions">
          <Button disabled={state.step <= 2 || saving} onClick={() => setState((current) => ({ ...current, step: current.step - 1 }))} variant="ghost">
            이전
          </Button>
          <Button disabled={sectionProgress(section, state.answers) < 100 || saving} loading={saving} onClick={() => continueFromQuestions(section)} size="lg">
            저장하고 다음
          </Button>
        </div>
      </Card>
    );
  }

  function renderPhoto() {
    const uploadAvailable = hasUploadCapability();
    return (
      <Card footer="사진은 선택 사항이며, 업로드하면 검수 완료 전까지 '검수 중'으로 표시됩니다." header={<Badge text="선택 단계" variant="default" />}>
        <div className="ssw-profile-heading">
          <h2>프로필 사진을 추가할 수 있어요</h2>
          <p>사진 없이도 계속 진행할 수 있습니다. 검수 상태는 매칭 전 안전 확인에 사용돼요.</p>
        </div>
        {uploadAvailable ? (
          <input
            aria-label="프로필 사진 업로드"
            className="ssw-upload-input"
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) {
                return;
              }
              setState((current) => ({ ...current, photo: { fileName: file.name, status: "pending" } }));
              try {
                const uploaded = await uploadFile(file);
                await callTool("upload_profile_photo", { fileId: uploaded.fileId, fileName: file.name, moderationStatus: "pending" });
                setState((current) => ({ ...current, photo: { fileId: uploaded.fileId, fileName: file.name, status: "pending" } }));
              } catch {
                setState((current) => ({ ...current, photo: { fileName: file.name, status: "error" } }));
              }
            }}
            type="file"
          />
        ) : (
          <EmptyState description="현재 환경에서는 window.openai.uploadFile을 사용할 수 없어 사진 없이 진행합니다." title="업로드 기능 없음" />
        )}
        <div className="ssw-photo-status">
          <Badge text={state.photo.status === "pending" ? "검수 중(pending)" : state.photo.status === "error" ? "업로드 실패" : uploadAvailable ? "사진 선택 가능" : "건너뜀"} variant={state.photo.status === "error" ? "error" : "default"} />
          {state.photo.fileName ? <span>{state.photo.fileName}</span> : <span>사진은 필수가 아니에요.</span>}
        </div>
        <div className="ssw-profile-actions">
          <Button onClick={() => setState((current) => ({ ...current, step: 4 }))} variant="ghost">
            이전
          </Button>
          <Button loading={saving} onClick={continueFromPhoto} size="lg">
            페르소나 미리보기
          </Button>
        </div>
      </Card>
    );
  }

  function renderPersona() {
    const persona = state.persona;
    const draft = personaDraft ?? persona;
    const disabledReason = missingConsents.length > 0 ? `${missingConsents[0]?.title} 동의가 필요해요.` : !isAdult(state.birthYear) ? "만 18세 이상 확인이 필요해요." : undefined;

    if (!persona || !draft) {
      return <ErrorState description="페르소나 초안을 불러오는 중입니다. 잠시 후 다시 시도해 주세요." onRetry={() => generatePersona(false)} title="미리보기 준비 중" />;
    }

    return (
      <Card header={<SyntheticBadge is_synthetic={persona.is_synthetic} />}>
        <div className="ssw-profile-heading">
          <h2>페르소나 미리보기</h2>
          <p>매칭 전에 공개 표현과 대화 경계를 확인하고 수정할 수 있어요.</p>
        </div>
        {personaEditing ? (
          <div className="ssw-persona-edit">
            <Field label="표시 이름" onChange={(event) => setPersonaDraft({ ...draft, displayName: event.currentTarget.value })} value={draft.displayName} />
            <Field label="대화 스타일" onChange={(event) => setPersonaDraft({ ...draft, communicationStyle: event.currentTarget.value })} value={draft.communicationStyle ?? ""} />
            <Field helperText="쉼표로 구분해 주세요." label="관심사" onChange={(event) => setPersonaDraft({ ...draft, interests: event.currentTarget.value.split(",").map((item) => item.trim()).filter(Boolean) })} value={draft.interests.join(", ")} />
            <Field helperText="정확한 주소, 직장명, 연소득 원문은 금지 주제로 유지해 주세요." label="대화 경계" onChange={(event) => setPersonaDraft({ ...draft, boundaries: event.currentTarget.value.split(",").map((item) => item.trim()).filter(Boolean) })} value={draft.boundaries.join(", ")} />
          </div>
        ) : (
          <div className="ssw-persona-preview">
            <div><strong>{persona.displayName}</strong><span>{persona.ageRange}</span></div>
            <div><strong>생활권</strong><span>{[persona.city, persona.district].filter(Boolean).join(" ") || "시/구 단위만 사용"}</span></div>
            <div><strong>대화 스타일</strong><span>{persona.communicationStyle}</span></div>
            <div><strong>관심사</strong><span>{persona.interests.join(", ") || answerSummary(state.answers).join(", ")}</span></div>
            <div><strong>대화 경계</strong><span>{persona.boundaries.join(", ")}</span></div>
          </div>
        )}
        {disabledReason ? <p className="ssw-profile-alert" role="alert">매칭 시작 불가: {disabledReason}</p> : null}
        {error ? <p className="ssw-profile-alert" role="alert">{error}</p> : null}
        <div className="ssw-profile-actions">
          <Button onClick={() => setState((current) => ({ ...current, step: 5 }))} variant="ghost">
            이전
          </Button>
          {personaEditing ? (
            <Button loading={saving} onClick={savePersonaDraft} variant="secondary">
              저장
            </Button>
          ) : (
            <Button onClick={() => { setPersonaDraft(persona); setPersonaEditing(true); }} variant="secondary">
              수정
            </Button>
          )}
          <Button loading={saving} onClick={() => generatePersona(true)} variant="ghost">
            다시 생성
          </Button>
          <Button disabled={Boolean(disabledReason) || saving || personaEditing} loading={saving} onClick={activateMatching} size="lg">
            매칭 시작
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="ssw-scope ssw-profile-shell">
      <GlobalStyles />
      <div className="ssw-profile-orb" />
      <Card className="ssw-profile-hero" padding="lg">
        <div className="ssw-profile-row ssw-profile-row--between">
          <div>
            <Badge text="SoulSync AI" variant="success" />
            <h1>프로필 온보딩</h1>
            <p>40문항과 동의를 바탕으로 안전한 매칭 페르소나를 준비합니다.</p>
          </div>
          <Badge text={`${ALL_PROFILE_QUESTIONS.length}문항`} variant="default" />
        </div>
        <Stepper currentStep={state.step + 1} labels={STEP_LABELS} totalSteps={STEP_LABELS.length} />
        <ProgressBar label="전체 진행률" value={completion} />
      </Card>
      {error && state.step !== 6 ? <p className="ssw-profile-alert" role="alert">{error}</p> : null}
      {state.step === 0 ? renderAgeGate() : null}
      {state.step === 1 ? (
        <ConsentScreen
          consent={state.consent}
          disabled={saving}
          error={error}
          onChange={(key: ConsentKey, checked: boolean) => {
            setError(undefined);
            setState((current) => ({ ...current, consent: { ...current.consent, [key]: checked } }));
          }}
          onContinue={continueFromConsent}
          onGrantAll={() => {
            setError(undefined);
            setState((current) => ({ ...current, consent: Object.fromEntries(Object.keys(current.consent).map((key) => [key, true])) as ConsentState }));
          }}
        />
      ) : null}
      {currentSection ? renderQuestions(currentSection) : null}
      {state.step === 5 ? renderPhoto() : null}
      {state.step === 6 ? renderPersona() : null}
    </div>
  );
}

export function mountProfileForm(element: Element) {
  return createRoot(element).render(<ProfileFormWidget />);
}

if (typeof document !== "undefined") {
  const mount = document.querySelector("[data-soulsync-profile-form]");
  if (mount) {
    mountProfileForm(mount);
  }
}
