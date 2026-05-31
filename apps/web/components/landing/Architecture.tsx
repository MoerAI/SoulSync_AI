import { Reveal } from "./Reveal";

export function Architecture() {
  return (
    <section id="architecture" className="section" aria-labelledby="architecture-title">
      <div className="container">
        <Reveal className="section-heading">
          <h2 id="architecture-title">🧩 ChatGPT Apps SDK + MCP + EXAONE의 만남</h2>
          <p>표준 MCP 프로토콜을 통해 자연어와 위젯 인터랙션을 매끄럽게 연결합니다.</p>
        </Reveal>
        <Reveal className="diagram-card">
          <div className="diagram-flow">
            <div className="diagram-node">
              <strong>ChatGPT Client</strong>
              <span>User Interaction</span>
            </div>
            <div className="diagram-arrow">MCP postMessage</div>
            <div className="diagram-node">
              <strong>Tinder Widget</strong>
              <span>iframe in chat, vanilla HTML/CSS/JS</span>
            </div>
          </div>
          <div className="diagram-flow diagram-row">
            <div className="diagram-node">
              <strong>Tinder Widget</strong>
              <span>카드, Like, 결과 위젯</span>
            </div>
            <div className="diagram-arrow">tools/call</div>
            <div className="diagram-node">
              <strong>MCP Server</strong>
              <span>Node.js · 14 tools · ⚙</span>
            </div>
          </div>
          <div className="diagram-flow diagram-row">
            <div className="diagram-node">
              <strong>MCP Server</strong>
              <span>표준 도구 실행</span>
            </div>
            <div className="diagram-arrow">Supabase</div>
            <div className="diagram-node">
              <strong>Supabase</strong>
              <span>users · personas · conversations · matches</span>
            </div>
          </div>
          <div className="diagram-flow diagram-row">
            <div className="diagram-node">
              <strong>EXAONE, GGUI</strong>
              <span>Persona · 8-turn chat · thought</span>
            </div>
            <div className="diagram-arrow">↔</div>
            <div className="diagram-node">
              <strong>MCP Server</strong>
              <span>대화 실행과 결과 저장</span>
            </div>
          </div>
          <div className="chip-row">
            <span className="chip">React</span>
            <span className="chip">TypeScript</span>
            <span className="chip">MCP SDK</span>
            <span className="chip">K-EXAONE</span>
            <span className="chip">GGUI</span>
            <span className="chip">ngrok HTTPS</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
