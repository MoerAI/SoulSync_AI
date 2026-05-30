import { Badge, Button, Card } from "../components";

export type ConsentKey =
  | "profilePublication"
  | "aiPersonaGeneration"
  | "agentSimulation"
  | "photoStorageModeration"
  | "sensitiveData"
  | "coarseLocation";

export type ConsentState = Record<ConsentKey, boolean>;

export const CONSENT_ITEMS: readonly {
  key: ConsentKey;
  title: string;
  description: string;
  required: boolean;
}[] = [
  {
    key: "profilePublication",
    title: "프로필 공개",
    description: "매칭 후보에게 공개 가능한 소개와 취향 정보를 보여줍니다.",
    required: true
  },
  {
    key: "aiPersonaGeneration",
    title: "AI 페르소나 생성",
    description: "답변을 바탕으로 대화용 페르소나 초안을 생성합니다.",
    required: true
  },
  {
    key: "agentSimulation",
    title: "에이전트 간 시뮬레이션",
    description: "상대 페르소나와의 가상 대화를 통해 궁합을 평가합니다.",
    required: true
  },
  {
    key: "photoStorageModeration",
    title: "사진 저장 및 검수",
    description: "업로드한 사진을 저장하고 안전성 검수를 진행합니다.",
    required: true
  },
  {
    key: "sensitiveData",
    title: "종교/가치관 민감정보 사용",
    description: "종교와 가치관 답변을 매칭 품질 개선 목적에만 사용합니다.",
    required: true
  },
  {
    key: "coarseLocation",
    title: "대략적인 생활권 사용",
    description: "시/구 단위 생활권만 사용하며 정확한 주소는 받지 않습니다.",
    required: true
  }
];

export const createEmptyConsent = (): ConsentState => ({
  profilePublication: false,
  aiPersonaGeneration: false,
  agentSimulation: false,
  photoStorageModeration: false,
  sensitiveData: false,
  coarseLocation: false
});

export function getMissingRequiredConsents(consent: ConsentState) {
  return CONSENT_ITEMS.filter((item) => item.required && !consent[item.key]);
}

type ConsentScreenProps = {
  consent: ConsentState;
  disabled?: boolean;
  error?: string;
  onChange: (key: ConsentKey, checked: boolean) => void;
  onGrantAll: () => void;
  onContinue: () => void;
};

export function ConsentScreen({ consent, disabled = false, error, onChange, onContinue, onGrantAll }: ConsentScreenProps) {
  const missingRequired = getMissingRequiredConsents(consent);
  const blockedReason = missingRequired.length > 0 ? `${missingRequired[0]?.title} 동의가 필요해요.` : undefined;

  return (
    <div className="ssw-profile-stack">
      <Card
        footer="동의 내역은 서버 도구에 저장되며, 위젯 상태만 단독 저장소로 사용하지 않습니다."
        header={
          <div className="ssw-profile-row ssw-profile-row--between">
            <Badge text="필수 동의" variant="success" />
            <Button onClick={onGrantAll} size="sm" variant="ghost">
              모두 동의
            </Button>
          </div>
        }
      >
        <div className="ssw-profile-heading">
          <h2>매칭을 시작하기 전 동의가 필요해요</h2>
          <p>각 항목을 따로 확인할 수 있고, 필수 동의가 없으면 다음 단계로 넘어갈 수 없어요.</p>
        </div>
        <div className="ssw-consent-list">
          {CONSENT_ITEMS.map((item) => (
            <label className="ssw-consent-item" key={item.key}>
              <input
                checked={consent[item.key]}
                className="ssw-consent-item__input"
                onChange={(event) => onChange(item.key, event.currentTarget.checked)}
                type="checkbox"
              />
              <span className="ssw-consent-item__body">
                <span className="ssw-profile-row ssw-profile-row--between">
                  <strong>{item.title}</strong>
                  <Badge text={item.required ? "필수" : "선택"} variant={item.required ? "success" : "default"} />
                </span>
                <span>{item.description}</span>
              </span>
            </label>
          ))}
        </div>
        {blockedReason ? <p className="ssw-profile-alert" role="alert">{blockedReason}</p> : null}
        {error ? <p className="ssw-profile-alert" role="alert">{error}</p> : null}
        <div className="ssw-profile-actions">
          <Button disabled={disabled} loading={disabled} onClick={onContinue} size="lg">
            동의 상태 저장하고 계속
          </Button>
        </div>
      </Card>
    </div>
  );
}
