import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useHeader } from "../contexts/useHeader";

const EMOJI = { Casa:"🏠", Elétrica:"⚡", Chácara:"🌿", Faculdade:"🎓", Trabalho:"💼", Pessoal:"👤", Saúde:"🏥", Financeiro:"💰", Outros:"📌" };

// ── Campo editável inline ─────────────────────────────────────────
function EditCell({ valor, tipo = "text", opcoes = [], onSave, placeholder = "" }) {
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState(valor);
  const [salvando, setSalvando] = useState(false);
  const [valorAnterior, setValorAnterior] = useState(valor);
  const inputRef = useRef();

  // Ressincroniza o rascunho quando o valor vem de fora (ex: outro campo
  // salvou e o pai repassou a tarefa atualizada) — ajustado durante o
  // render em vez de um efeito, como recomendado pelo React pra esse caso.
  if (valor !== valorAnterior) {
    setValorAnterior(valor);
    setDraft(valor);
  }

  useEffect(() => { if (editando && inputRef.current) inputRef.current.focus(); }, [editando]);

  async function salvar() {
    if (draft === valor) { setEditando(false); return; }
    setSalvando(true);
    await onSave(draft);
    setSalvando(false);
    setEditando(false);
  }

  if (editando) {
    if (tipo === "select") {
      return (
        <select ref={inputRef} value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { salvar(); }}
          className="text-xs px-1.5 py-0.5 rounded border border-roxo-700 bg-cinza-850 text-cinza-50 outline-none cursor-pointer w-full">
          {opcoes.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    return (
      <input ref={inputRef} value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={salvar}
        onKeyDown={e => { if (e.key === "Enter") salvar(); if (e.key === "Escape") setEditando(false); }}
        placeholder={placeholder}
        className="text-xs px-1.5 py-0.5 rounded border border-roxo-700 bg-cinza-850 text-cinza-50 outline-none w-full min-w-0"
        style={{ maxWidth: tipo === "hora" ? 60 : tipo === "data" ? 70 : "100%" }}
      />
    );
  }

  return (
    <span onClick={() => setEditando(true)}
      title="Clique para editar"
      className="cursor-pointer hover:opacity-70 transition-opacity truncate"
      style={{ minWidth: 10 }}>
      {salvando ? "..." : (valor || <span className="text-cinza-300">{placeholder || "—"}</span>)}
    </span>
  );
}

export default function Tarefas() {
  const { setCfg } = useHeader();
  const [tarefas, setTarefas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catFiltro, setCatFiltro] = useState("Todas");
  const [statusFiltro, setStatusFiltro] = useState("Pendente");
  const [dataFiltro, setDataFiltro] = useState("Todas");

  const hoje = new Date().toLocaleDateString("pt-BR", { day:"2-digit", month:"short" })
    .replace(". de ", "/").replace(".", "").replace(" de ", "/");

  async function carregar() {
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase.from("tarefas").select("*").order("id"),
      supabase.from("categorias").select("nome, emoji").order("nome"),
    ]);
    setTarefas(t || []);
    setCategorias(c || []);
    setLoading(false);
  }

  // Busca inicial ao montar — carregar só seta estado depois do await, mas
  // a regra não distingue isso do caso síncrono.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { carregar(); }, []);

  async function atualizarCampo(id, campo, valor) {
    const dbCampo = {
      descricao: "descricao",
      data: "data",
      hora: "hora",
      categoria: "categoria",
      recorrente: "recorrente",
    }[campo];
    if (!dbCampo) return;

    await supabase.from("tarefas").update({ [dbCampo]: valor }).eq("id", id);
    setTarefas(t => t.map(x => x.id === id ? { ...x, [campo]: valor } : x));
  }

  async function toggleConcluir(tarefa) {
    const ehRecorrente = tarefa.recorrente && tarefa.recorrente !== "Não";
    if (ehRecorrente) {
      await supabase.from("tarefas").update({ data_conclusao: hoje }).eq("id", tarefa.id);
      setTarefas(t => t.map(x => x.id === tarefa.id ? { ...x, data_conclusao: hoje } : x));
    } else {
      const novoStatus = tarefa.status === "Concluída" ? "Pendente" : "Concluída";
      await supabase.from("tarefas").update({ status: novoStatus }).eq("id", tarefa.id);
      setTarefas(t => t.map(x => x.id === tarefa.id ? { ...x, status: novoStatus } : x));
    }
  }

  async function excluir(id) {
    await supabase.from("tarefas").delete().eq("id", id);
    setTarefas(t => t.filter(x => x.id !== id));
  }

  const nomeCats = ["Todas", ...categorias.map(c => c.nome)];

  const filtradas = tarefas.filter(t => {
    if (catFiltro !== "Todas" && t.categoria !== catFiltro) return false;
    if (statusFiltro === "Pendente" && t.status === "Concluída") return false;
    if (statusFiltro === "Concluída" && t.status !== "Concluída") return false;
    if (dataFiltro === "Hoje" && t.data !== hoje) return false;
    if (dataFiltro === "Backlog" && t.data !== "backlog") return false;
    if (dataFiltro === "Recorrentes" && (!t.recorrente || t.recorrente === "Não")) return false;
    return true;
  });

  const pendentes = tarefas.filter(t => t.status !== "Concluída").length;
  const hojeCount = tarefas.filter(t => t.data === hoje && t.status !== "Concluída").length;

  useEffect(() => {
    setCfg({
      title: "Tarefas",
      subtitle: `${pendentes} pendentes · ${hojeCount} para hoje`,
      right: null,
      secondRow: null,
    });
  }, [pendentes, hojeCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const FiltroBtn = ({ ativo, onClick, children }) => (
    <button onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs border transition-all whitespace-nowrap
        ${ativo ? "border-roxo-700 bg-roxo-700/13 text-roxo-400" : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
      {children}
    </button>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Filtros */}
        <div className="flex flex-col gap-2 mb-5">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {[dataFiltro, ...["Todas","Hoje","Backlog","Recorrentes"].filter(f => f !== dataFiltro)].map(f => (
              <FiltroBtn key={f} ativo={dataFiltro === f} onClick={() => setDataFiltro(f)}>{f}</FiltroBtn>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {[statusFiltro, ...["Todas","Pendente","Concluída"].filter(s => s !== statusFiltro)].map(s => (
              <FiltroBtn key={s} ativo={statusFiltro === s} onClick={() => setStatusFiltro(s)}>{s}</FiltroBtn>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {[catFiltro, ...nomeCats.filter(c => c !== catFiltro)].map(c => (
              <FiltroBtn key={c} ativo={catFiltro === c} onClick={() => setCatFiltro(c)}>
                {c !== "Todas" ? (EMOJI[c] || "📌") + " " : ""}{c}
              </FiltroBtn>
            ))}
          </div>
        </div>

        <div className="text-[10px] text-cinza-350 mb-3">💡 Clique em qualquer campo para editar</div>

        {loading ? (
          <div className="text-center text-cinza-350 py-10 text-sm">Carregando...</div>
        ) : filtradas.length === 0 ? (
          <div className="text-center text-cinza-350 py-10 text-sm">Nenhuma tarefa encontrada ✨</div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtradas.map(t => {
              const concluida = t.status === "Concluída";
              const ehRecorrente = t.recorrente && t.recorrente !== "Não";
              const concluídaHoje = t.data_conclusao === hoje;

              return (
                <div key={t.id}
                  className={`bg-cinza-900 border border-cinza-800 rounded-xl px-4 py-3 hover:bg-cinza-850 transition-colors
                    ${concluida || concluídaHoje ? "opacity-50" : ""}`}>

                  {/* Linha principal */}
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <button onClick={() => toggleConcluir(t)}
                      className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all
                        ${concluida || concluídaHoje ? "border-emerald-400 bg-emerald-400" : "border-cinza-600 hover:border-roxo-700"}`}>
                      {(concluida || concluídaHoje) && <span className="text-[10px] text-cinza-950 font-bold">✓</span>}
                    </button>

                    {/* Descrição editável */}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${concluida || concluídaHoje ? "line-through text-cinza-350" : "text-cinza-50"}`}>
                        <EditCell
                          valor={t.descricao.charAt(0) + t.descricao.slice(1).toLowerCase()}
                          tipo="text"
                          placeholder="Descrição"
                          onSave={v => atualizarCampo(t.id, "descricao", v.toUpperCase())}
                        />
                      </div>

                      {/* Linha de metadados editáveis */}
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-cinza-200">

                        {/* Data */}
                        <span className="flex items-center gap-1">
                          📅
                          <EditCell
                            valor={t.data === "backlog" ? "sem data" : t.data}
                            tipo="text"
                            placeholder="DD/mmm"
                            onSave={v => atualizarCampo(t.id, "data", v === "sem data" ? "backlog" : v)}
                          />
                        </span>

                        {/* Hora */}
                        <span className="flex items-center gap-1">
                          ⏰
                          <EditCell
                            valor={t.hora}
                            tipo="text"
                            placeholder="HH:MM"
                            onSave={v => atualizarCampo(t.id, "hora", v)}
                          />
                        </span>

                        {/* Categoria */}
                        <EditCell
                          valor={`${EMOJI[t.categoria] || "📌"} ${t.categoria}`}
                          tipo="select"
                          opcoes={nomeCats.filter(c => c !== "Todas")}
                          onSave={v => atualizarCampo(t.id, "categoria", v)}
                        />

                        {/* Recorrente */}
                        {ehRecorrente && (
                          <span className="text-amber-400 flex items-center gap-1">
                            🔁
                            <EditCell
                              valor={t.recorrente}
                              tipo="text"
                              placeholder="dias"
                              onSave={v => atualizarCampo(t.id, "recorrente", v)}
                            />
                          </span>
                        )}

                        {/* Data badge */}
                        {t.data !== "backlog" && t.data && (
                          <span className={`font-mono text-[10px] ${t.data === hoje ? "text-emerald-400" : "text-roxo-400"}`}>
                            {t.data === hoje ? "hoje" : t.data}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Excluir */}
                    <button onClick={() => excluir(t.id)}
                      className="text-cinza-300 hover:text-red-400 transition-colors text-xs mt-0.5 shrink-0">✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
