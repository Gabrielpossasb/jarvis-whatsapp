import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useHeader } from "../contexts/HeaderContext";
import Modal from "../components/Modal";

const CATEGORIAS = ["Polpas", "Frutas", "Outros", "Açaí em pote"];
const fmtQtd = (v, u) =>
  `${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${u}`;
const fmtMoeda = v =>
  v != null ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : null;
const fmtData = s =>
  new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const TIPO_LABEL = { entrada: "Entrada", venda: "Venda", consumo: "Consumo", contagem: "Contagem" };
const TIPO_SINAL = { entrada: "+", venda: "−", consumo: "−", contagem: "=" };
const TIPO_BADGE = {
  entrada: "bg-emerald-500/15 text-emerald-400",
  venda: "bg-red-500/15 text-red-400",
  consumo: "bg-amber-500/15 text-amber-400",
  contagem: "bg-sky-500/15 text-sky-400",
};

const EMOJI_PADRAO = "🍹";
const BUCKET_ICONES = "estoque-icones";

// Mostra a imagem enviada pra esse produto (icone_url), com o emoji como
// fallback quando não há imagem — mesmo helper em toda a página pra não
// duplicar essa checagem em cada lugar que mostra um sabor.
function IconeProduto({ p, size = 20 }) {
  if (p?.icone_url) {
    return (
      <img src={p.icone_url} alt="" className="rounded-lg object-cover shrink-0"
        style={{ width: size, height: size }} />
    );
  }
  return (
    <span className="leading-none shrink-0" style={{ fontSize: size }}>
      {p?.emoji || EMOJI_PADRAO}
    </span>
  );
}

export default function Estoque() {
  const { setCfg } = useHeader();
  const [produtos, setProdutos] = useState([]);
  const [movs, setMovs] = useState([]);
  const [aba, setAba] = useState("estoque");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [modalConteudo, setModalConteudo] = useState(null);
  if (modal && modal !== modalConteudo) setModalConteudo(modal);
  const [filtroMov, setFiltroMov] = useState("todos");
  const [toast, setToast] = useState(null);
  const [modoContagem, setModoContagem] = useState(false);
  const [contagens, setContagens] = useState({});
  const [salvandoContagem, setSalvandoContagem] = useState(false);
  const [textoContagem, setTextoContagem] = useState("");
  const [abaContagem, setAbaContagem] = useState("formulario");

  // Modal de movimentação individual
  const [tipoMov, setTipoMov] = useState("entrada");
  const [quantidade, setQuantidade] = useState("");
  const [pessoa, setPessoa] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Modal de edição
  const [editNome, setEditNome] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [editIconeUrl, setEditIconeUrl] = useState("");
  const [enviandoIcone, setEnviandoIcone] = useState(false);
  const [editMin, setEditMin] = useState("");
  const [editPreco, setEditPreco] = useState("");
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);

  // Modal de novo produto
  const [novoNome, setNovoNome] = useState("");
  const [novoCategoria, setNovoCategoria] = useState(CATEGORIAS[0]);
  const [novoUnidade, setNovoUnidade] = useState("kg");
  const [novoEmoji, setNovoEmoji] = useState("");
  const [novoIconeUrl, setNovoIconeUrl] = useState("");
  const [enviandoIconeNovo, setEnviandoIconeNovo] = useState(false);
  const [novoMin, setNovoMin] = useState("");
  const [novoPreco, setNovoPreco] = useState("");

  // Gerenciar (venda/entrada em lote)
  const [modoGerenciar, setModoGerenciar] = useState(false);
  const [tipoGerenciar, setTipoGerenciar] = useState("venda"); // 'venda' | 'entrada'
  const [itensGerenciar, setItensGerenciar] = useState({}); // { [produto_id]: number }
  const [clienteGerenciar, setClienteGerenciar] = useState("");
  const [pickerAberto, setPickerAberto] = useState(false);
  const [salvandoGerenciar, setSalvandoGerenciar] = useState(false);

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function carregarProdutos() {
    const { data } = await supabase
      .from("estoque_produtos")
      .select("*")
      .eq("ativo", true)
      .order("nome");
    if (data) setProdutos(data);
  }

  async function carregarMovs() {
    const { data } = await supabase
      .from("estoque_movimentacoes")
      .select("*, produto:produto_id(nome, unidade, emoji, icone_url)")
      .order("criado_em", { ascending: false })
      .limit(300);
    if (data) setMovs(data);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([carregarProdutos(), carregarMovs()]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const alertas = produtos.filter(p => Number(p.estoque_atual) < Number(p.estoque_minimo)).length;
    const totalKg = produtos
      .filter(p => p.unidade === "kg")
      .reduce((s, p) => s + Number(p.estoque_atual), 0);
    setCfg({
      title: "Estoque",
      subtitle: alertas > 0
        ? `${totalKg.toFixed(1)} kg · ⚠️ ${alertas} abaixo do mínimo`
        : `${totalKg.toFixed(1)} kg · tudo ok`,
      right: (
        <div className="flex gap-2">
          <button
            onClick={() => { setItensGerenciar({}); setClienteGerenciar(""); setTipoGerenciar("venda"); setPickerAberto(false); setModoGerenciar(true); }}
            className="text-xs px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors whitespace-nowrap">
            🔄 Gerenciar
          </button>
          <button
            onClick={() => { setContagens({}); setTextoContagem(""); setAbaContagem("formulario"); setModoContagem(true); }}
            className="text-xs px-3 py-1 rounded-full bg-cinza-850 border border-cinza-700 text-cinza-200 hover:border-roxo-700 hover:text-roxo-400 transition-colors whitespace-nowrap">
            📋 Contagem
          </button>
          <button
            onClick={abrirNovoProduto}
            className="text-xs px-3 py-1 rounded-full bg-roxo-700/10 border border-roxo-700/30 text-roxo-400 hover:bg-roxo-700/20 transition-colors whitespace-nowrap">
            + Produto
          </button>
        </div>
      ),
      secondRow: (
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {[["estoque", "📦 Estoque"], ["historico", "📋 Histórico"]].map(([a, l]) => (
            <button key={a} onClick={() => setAba(a)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all shrink-0
                ${aba === a
                  ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                  : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
              {l}
            </button>
          ))}
        </div>
      ),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos, aba]);

  function abrirMov(produto, tipo = "entrada") {
    setTipoMov(tipo);
    setQuantidade("");
    setPessoa("");
    setObs("");
    setModal({ tipo: "mov", produto });
  }

  function abrirEditar(produto) {
    setEditNome(produto.nome);
    setEditEmoji(produto.emoji || "");
    setEditIconeUrl(produto.icone_url || "");
    setEditMin(String(produto.estoque_minimo));
    setEditPreco(produto.preco != null ? String(produto.preco) : "");
    setConfirmandoRemocao(false);
    setModal({ tipo: "editar", produto });
  }

  function abrirNovoProduto() {
    setNovoNome("");
    setNovoCategoria(CATEGORIAS[0]);
    setNovoUnidade("kg");
    setNovoEmoji("");
    setNovoIconeUrl("");
    setNovoMin("");
    setNovoPreco("");
    setModal({ tipo: "novo" });
  }

  // Produto ainda não existe (sem id) nesse ponto, então o upload usa uma
  // chave aleatória em vez do id do produto (diferente de enviarIcone, usado
  // na edição de um produto já criado).
  async function enviarIconeNovo(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast("Imagem muito grande (máx. 2MB)", false);
      return;
    }
    setEnviandoIconeNovo(true);
    const ext = file.name.split(".").pop();
    const caminho = `novo-${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET_ICONES).upload(caminho, file, { upsert: true });
    if (error) {
      showToast("Erro ao enviar imagem", false);
    } else {
      const { data } = supabase.storage.from(BUCKET_ICONES).getPublicUrl(caminho);
      setNovoIconeUrl(data.publicUrl);
    }
    setEnviandoIconeNovo(false);
  }

  async function criarProduto() {
    const nome = novoNome.trim();
    if (!nome) return;
    setSalvando(true);
    const { data, error } = await supabase.from("estoque_produtos").insert({
      nome,
      categoria: novoCategoria,
      unidade: novoUnidade,
      emoji: novoEmoji.trim() || null,
      icone_url: novoIconeUrl || null,
      estoque_atual: 0,
      estoque_minimo: parseFloat(String(novoMin).replace(",", ".")) || 0,
      preco: novoPreco ? parseFloat(String(novoPreco).replace(",", ".")) : null,
      ativo: true,
    }).select().single();

    if (error) {
      showToast("Erro ao criar produto", false);
    } else {
      setProdutos(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      showToast("Produto criado");
      setModal(null);
    }
    setSalvando(false);
  }

  // Desativa em vez de excluir (mesma convenção de "ativo" usada no resto do
  // projeto, ex: encerrar semestre em faculdade_aulas) — preserva o
  // histórico de movimentações em vez de apagar tudo via cascade.
  async function removerProduto() {
    setSalvando(true);
    const p = modal.produto;
    const { error } = await supabase.from("estoque_produtos").update({ ativo: false }).eq("id", p.id);
    if (error) {
      showToast("Erro ao remover produto", false);
    } else {
      setProdutos(prev => prev.filter(x => x.id !== p.id));
      showToast("Produto removido");
      setModal(null);
    }
    setSalvando(false);
  }

  async function enviarIcone(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast("Imagem muito grande (máx. 2MB)", false);
      return;
    }
    setEnviandoIcone(true);
    const ext = file.name.split(".").pop();
    const caminho = `${modalConteudo.produto.id}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET_ICONES).upload(caminho, file, { upsert: true });
    if (error) {
      showToast("Erro ao enviar imagem", false);
    } else {
      const { data } = supabase.storage.from(BUCKET_ICONES).getPublicUrl(caminho);
      setEditIconeUrl(data.publicUrl);
    }
    setEnviandoIcone(false);
  }

  // Stepper de quantidade no modal individual (+/-) — sempre de 1 em 1
  function adjQuantidade(delta) {
    const atual = parseFloat(String(quantidade).replace(",", ".")) || 0;
    const novo = Math.max(0, atual + delta);
    setQuantidade(novo === 0 ? "" : String(novo));
  }

  // Stepper de quantidade no gerenciar em lote (+/-) — usado tanto na
  // lista de itens adicionados quanto no picker (onde o primeiro "+"
  // já adiciona o sabor); chegar a 0 remove o item do lote.
  function adjItemGerenciar(prodId, delta) {
    setItensGerenciar(prev => {
      const novo = (prev[prodId] || 0) + delta;
      if (novo <= 0) {
        const next = { ...prev };
        delete next[prodId];
        return next;
      }
      return { ...prev, [prodId]: novo };
    });
  }

  function removerItemGerenciar(prodId) {
    setItensGerenciar(prev => {
      const next = { ...prev };
      delete next[prodId];
      return next;
    });
  }

  function fecharGerenciar() {
    setModoGerenciar(false);
    setPickerAberto(false);
  }

  function fecharContagem() {
    setModoContagem(false);
  }

  async function registrarMovimentacao() {
    const qtd = parseFloat(String(quantidade).replace(",", "."));
    if (!qtd || qtd <= 0) return;
    setSalvando(true);
    const p = modal.produto;
    const delta = tipoMov === "entrada" ? qtd : -qtd;
    const novoEstoque = Math.max(0, Number(p.estoque_atual) + delta);

    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("estoque_movimentacoes").insert({
        produto_id: p.id,
        tipo: tipoMov,
        quantidade: qtd,
        pessoa: tipoMov === "consumo" ? (pessoa.trim() || null) : null,
        observacao: obs.trim() || null,
      }),
      supabase.from("estoque_produtos").update({ estoque_atual: novoEstoque }).eq("id", p.id),
    ]);

    if (e1 || e2) {
      showToast("Erro ao registrar", false);
    } else {
      setProdutos(prev => prev.map(x => x.id === p.id ? { ...x, estoque_atual: novoEstoque } : x));
      setMovs(prev => [{
        id: `tmp-${Date.now()}`,
        produto_id: p.id,
        tipo: tipoMov,
        quantidade: qtd,
        pessoa: tipoMov === "consumo" ? (pessoa.trim() || null) : null,
        observacao: obs.trim() || null,
        criado_em: new Date().toISOString(),
        produto: { nome: p.nome, unidade: p.unidade, emoji: p.emoji, icone_url: p.icone_url },
      }, ...prev]);
      showToast(tipoMov === "entrada"
        ? `+${fmtQtd(qtd, p.unidade)} adicionado`
        : `−${fmtQtd(qtd, p.unidade)} registrado`);
      setModal(null);
    }
    setSalvando(false);
  }

  async function registrarGerenciar() {
    const itensAtivos = produtos.filter(p => (itensGerenciar[p.id] || 0) > 0);
    if (itensAtivos.length === 0) return;

    setSalvandoGerenciar(true);
    const agora = new Date().toISOString();
    const sinal = tipoGerenciar === "entrada" ? 1 : -1;

    const insertsMovs = itensAtivos.map(p => ({
      produto_id: p.id,
      tipo: tipoGerenciar,
      quantidade: itensGerenciar[p.id],
      pessoa: tipoGerenciar === "venda" ? (clienteGerenciar.trim() || null) : null,
      observacao: null,
      criado_em: agora,
    }));

    const { error } = await supabase.from("estoque_movimentacoes").insert(insertsMovs);

    if (!error) {
      await Promise.all(itensAtivos.map(p => {
        const novoEstoque = Math.max(0, Number(p.estoque_atual) + sinal * itensGerenciar[p.id]);
        return supabase.from("estoque_produtos").update({ estoque_atual: novoEstoque }).eq("id", p.id);
      }));

      setProdutos(prev => prev.map(p => {
        const qty = itensGerenciar[p.id];
        if (!qty) return p;
        return { ...p, estoque_atual: Math.max(0, Number(p.estoque_atual) + sinal * qty) };
      }));

      setMovs(prev => [
        ...insertsMovs.map((m, i) => ({
          ...m,
          id: `tmp-ger-${Date.now()}-${i}`,
          produto: { nome: itensAtivos[i].nome, unidade: itensAtivos[i].unidade, emoji: itensAtivos[i].emoji, icone_url: itensAtivos[i].icone_url },
        })),
        ...prev,
      ]);

      const totalR = tipoGerenciar === "venda"
        ? itensAtivos.reduce((s, p) => s + (itensGerenciar[p.id] * (p.preco || 0)), 0)
        : 0;
      const acao = tipoGerenciar === "venda" ? "vendido(s)" : "recebido(s)";
      showToast(`${itensAtivos.length} produto(s) ${acao}${totalR > 0 ? ` · R$ ${totalR.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}`);
      fecharGerenciar();
    } else {
      showToast("Erro ao registrar", false);
    }
    setSalvandoGerenciar(false);
  }

  async function salvarEdicao() {
    setSalvando(true);
    const p = modal.produto;
    const updates = {
      nome: editNome.trim() || p.nome,
      emoji: editEmoji.trim() || null,
      icone_url: editIconeUrl || null,
      estoque_minimo: parseFloat(String(editMin).replace(",", ".")) || 0,
      preco: editPreco ? parseFloat(String(editPreco).replace(",", ".")) : null,
    };
    const { error } = await supabase.from("estoque_produtos").update(updates).eq("id", p.id);
    if (error) {
      showToast("Erro ao salvar", false);
    } else {
      setProdutos(prev => prev.map(x => x.id === p.id ? { ...x, ...updates } : x));
      showToast("Produto atualizado");
      setModal(null);
    }
    setSalvando(false);
  }

  async function salvarContagem() {
    const alterados = produtos.filter(p => {
      const v = contagens[p.id];
      if (v === undefined || v === "") return false;
      return parseFloat(String(v).replace(",", ".")) !== Number(p.estoque_atual);
    });
    if (alterados.length === 0) { setModoContagem(false); return; }

    setSalvandoContagem(true);
    const agora = new Date().toISOString();

    const insertsMovs = alterados.map(p => {
      const novoVal = parseFloat(String(contagens[p.id]).replace(",", "."));
      return {
        produto_id: p.id,
        tipo: "contagem",
        quantidade: novoVal,
        observacao: `era ${fmtQtd(p.estoque_atual, p.unidade)} → agora ${fmtQtd(novoVal, p.unidade)}`,
        criado_em: agora,
      };
    });

    const { error: e1 } = await supabase.from("estoque_movimentacoes").insert(insertsMovs);

    if (!e1) {
      await Promise.all(alterados.map(p => {
        const novoVal = parseFloat(String(contagens[p.id]).replace(",", "."));
        return supabase.from("estoque_produtos").update({ estoque_atual: novoVal }).eq("id", p.id);
      }));

      setProdutos(prev => prev.map(p => {
        const v = contagens[p.id];
        if (v === undefined || v === "") return p;
        const novoVal = parseFloat(String(v).replace(",", "."));
        if (novoVal === Number(p.estoque_atual)) return p;
        return { ...p, estoque_atual: novoVal };
      }));

      setMovs(prev => [
        ...insertsMovs.map((m, i) => ({
          ...m,
          id: `tmp-cont-${Date.now()}-${i}`,
          produto: { nome: alterados[i].nome, unidade: alterados[i].unidade, emoji: alterados[i].emoji, icone_url: alterados[i].icone_url },
        })),
        ...prev,
      ]);

      showToast(`${alterados.length} produto${alterados.length > 1 ? "s" : ""} atualizado${alterados.length > 1 ? "s" : ""}`);
    } else {
      showToast("Erro ao salvar contagem", false);
    }

    setSalvandoContagem(false);
    setModoContagem(false);
    setContagens({});
  }

  const LINHA_RE = /^(.+?)\s*[—–-]+\s*([\d,.]+)\s*(kg|un)?\s*$/i;
  function normNome(s) {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  }
  function parsearTexto(texto) {
    return texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean).flatMap(linha => {
      const m = linha.match(LINHA_RE);
      if (!m) return [];
      const qtd = parseFloat(m[2].replace(",", "."));
      if (isNaN(qtd) || qtd < 0) return [];
      return [{ nome: m[1].trim(), quantidade: qtd }];
    });
  }
  function resolverProdutosTexto(itens) {
    return itens.map(item => {
      const n = normNome(item.nome);
      const produto = produtos.find(p => normNome(p.nome) === n)
        || produtos.find(p => normNome(p.nome).includes(n))
        || produtos.find(p => n.includes(normNome(p.nome)));
      return { ...item, produto: produto || null };
    });
  }

  async function salvarContagemTexto() {
    const itens = parsearTexto(textoContagem);
    const resolvidos = resolverProdutosTexto(itens).filter(i => i.produto);
    const alterados = resolvidos.filter(i => i.quantidade !== Number(i.produto.estoque_atual));
    if (alterados.length === 0) { setModoContagem(false); return; }

    setSalvandoContagem(true);
    const agora = new Date().toISOString();
    const insertsMovs = alterados.map(i => ({
      produto_id: i.produto.id,
      tipo: "contagem",
      quantidade: i.quantidade,
      observacao: `era ${fmtQtd(i.produto.estoque_atual, i.produto.unidade)} → agora ${fmtQtd(i.quantidade, i.produto.unidade)}`,
      criado_em: agora,
    }));

    const { error } = await supabase.from("estoque_movimentacoes").insert(insertsMovs);
    if (!error) {
      await Promise.all(alterados.map(i =>
        supabase.from("estoque_produtos").update({ estoque_atual: i.quantidade }).eq("id", i.produto.id)
      ));
      setProdutos(prev => prev.map(p => {
        const hit = alterados.find(i => i.produto.id === p.id);
        return hit ? { ...p, estoque_atual: hit.quantidade } : p;
      }));
      setMovs(prev => [
        ...insertsMovs.map((m, idx) => ({
          ...m, id: `tmp-txt-${Date.now()}-${idx}`,
          produto: { nome: alterados[idx].produto.nome, unidade: alterados[idx].produto.unidade, emoji: alterados[idx].produto.emoji, icone_url: alterados[idx].produto.icone_url },
        })),
        ...prev,
      ]);
      showToast(`${alterados.length} produto${alterados.length > 1 ? "s" : ""} atualizado${alterados.length > 1 ? "s" : ""}`);
    } else {
      showToast("Erro ao salvar contagem", false);
    }
    setSalvandoContagem(false);
    setModoContagem(false);
    setTextoContagem("");
  }

  const porCategoria = CATEGORIAS.map(cat => ({
    cat,
    itens: produtos.filter(p => p.categoria === cat),
  })).filter(g => g.itens.length > 0);

  const movsFiltradas = filtroMov === "todos" ? movs : movs.filter(m => m.tipo === filtroMov);

  // Itens do gerenciar em lote
  const itensGerenciarAtivos = produtos.filter(p => (itensGerenciar[p.id] || 0) > 0);
  const gerenciarTotalR = tipoGerenciar === "venda"
    ? itensGerenciarAtivos.reduce((s, p) => s + (itensGerenciar[p.id] * (p.preco || 0)), 0)
    : 0;

  return (
    <div className="flex flex-col h-full">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-2.5 rounded-xl text-sm font-medium shadow-xl pointer-events-none
          ${toast.ok ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-cinza-350 text-sm">
          Carregando...
        </div>
      ) : aba === "estoque" ? (

        /* ── Aba Estoque ──────────────────────────── */
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
          {porCategoria.map(({ cat, itens }) => (
            <div key={cat} className="mb-6">
              <div className="text-[10px] text-cinza-350 tracking-widest font-medium px-1 mb-2 uppercase">
                {cat}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {itens.map(p => {
                  const atual = Number(p.estoque_atual);
                  const minimo = Number(p.estoque_minimo);
                  const abaixo = atual < minimo;
                  const pct = minimo > 0 ? Math.min(100, (atual / minimo) * 100) : 100;
                  return (
                    <div key={p.id}
                      className={`relative bg-cinza-900 border rounded-xl p-3 flex flex-col gap-2
                        ${abaixo ? "border-red-500/40" : "border-cinza-800"}`}>

                      <button onClick={() => abrirEditar(p)}
                        className="absolute top-2 right-2 text-cinza-300 hover:text-roxo-400 transition-colors z-10">
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                          <path d="M11.5 1.5a1.5 1.5 0 0 1 2.12 2.12l-8.5 8.5-2.83.71.71-2.83 8.5-8.5z"/>
                        </svg>
                      </button>

                      {/* Imagem/emoji + nome centralizados */}
                      <div className="flex items-center gap-4 pt-1">
                        <IconeProduto p={p} size={44} />
                        <span className="text-[14px] font-medium text-cinza-50 leading-tight text-center">
                          {abaixo && <span className="text-red-400 mr-0.5">⚠</span>}
                          {p.nome}
                        </span>
                      </div>

                      {/* Estoque atual */}
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className={`text-base font-bold leading-tight ${abaixo ? "text-red-400" : "text-roxo-400"}`}>
                            {fmtQtd(atual, p.unidade)}
                          </div>
                          <div className="text-[10px] text-cinza-350 mt-0.5">mín {fmtQtd(minimo, p.unidade)}</div>
                        </div>

                        <button onClick={() => abrirMov(p, "venda")}
                          title="Registrar venda"
                          className="w-8 h-8 shrink-0 flex items-center pb-1 justify-center rounded-full bg-roxo-700 hover:bg-roxo-600 text-white font-bold text-2xl leading-none transition-colors">
                          +
                        </button>
                      </div>

                      {/* Barra de progresso */}
                      <div className="w-full h-1 rounded-full bg-cinza-700 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${abaixo ? "bg-red-500" : "bg-roxo-700"}`}
                          style={{ width: `${pct}%` }} />
                      </div>

                      {/* Preço */}
                      {fmtMoeda(p.preco) && (
                        <div className="text-[10px] text-cinza-300">{fmtMoeda(p.preco)}/{p.unidade}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

      ) : (

        /* ── Aba Histórico ────────────────────────── */
        <div className="flex flex-col h-full overflow-hidden">
          <div className="px-4 md:px-6 pt-3 pb-2 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
            {["todos", "entrada", "venda", "consumo", "contagem"].map(t => (
              <button key={t} onClick={() => setFiltroMov(t)}
                className={`px-3 py-1 rounded-full text-xs border transition-all whitespace-nowrap shrink-0
                  ${filtroMov === t
                    ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                    : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
                {t === "todos" ? "Todos" : TIPO_LABEL[t]}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-4">
            {movsFiltradas.length === 0 ? (
              <div className="text-center text-cinza-350 text-sm py-10">Nenhuma movimentação</div>
            ) : (
              <div className="bg-cinza-900 border border-cinza-800 rounded-xl overflow-hidden">
                {movsFiltradas.map((m, i) => (
                  <div key={m.id}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-cinza-850 transition-colors
                      ${i < movsFiltradas.length - 1 ? "border-b border-cinza-850" : ""}`}>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${TIPO_BADGE[m.tipo]}`}>
                      {TIPO_LABEL[m.tipo]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-xs text-cinza-50 truncate">
                        <IconeProduto p={m.produto} size={22} />
                        {m.produto?.nome || "—"}
                        {m.pessoa && (
                          <span className="text-cinza-200 ml-1.5">· {m.pessoa}</span>
                        )}
                      </div>
                      {m.observacao && (
                        <div className="text-[10px] text-cinza-350 truncate mt-0.5">{m.observacao}</div>
                      )}
                    </div>
                    <div className={`text-xs font-semibold shrink-0
                      ${m.tipo === "entrada" ? "text-emerald-400"
                        : m.tipo === "contagem" ? "text-sky-400"
                        : "text-red-400"}`}>
                      {TIPO_SINAL[m.tipo]}{fmtQtd(m.quantidade, m.produto?.unidade || "")}
                    </div>
                    <div className="text-[10px] text-cinza-350 shrink-0 hidden sm:block">
                      {fmtData(m.criado_em)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal de Gerenciar (venda/entrada em lote) ───── */}
      <Modal open={modoGerenciar} onClose={fecharGerenciar} align="bottom">
        <div className="bg-cinza-900 border border-cinza-700 rounded-2xl w-full max-w-md mx-auto flex flex-col max-h-[88vh] sm:max-h-[75vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-cinza-800 shrink-0">
              <span className="text-sm font-semibold text-cinza-50">🔄 Gerenciar Estoque</span>
              <button onClick={fecharGerenciar}
                className="text-cinza-200 hover:text-cinza-50 transition-colors text-xl leading-none">
                ✕
              </button>
            </div>

            {/* Toggle Venda / Entrada */}
            <div className="px-5 py-3 border-b border-cinza-800 shrink-0 flex gap-2">
              {["venda", "entrada"].map(t => (
                <button key={t} onClick={() => setTipoGerenciar(t)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all
                    ${tipoGerenciar === t
                      ? t === "venda" ? "border-red-500 bg-red-500/15 text-red-400" : "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                      : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
                  {t === "venda" ? "🔻 Venda" : "🔺 Entrada de estoque"}
                </button>
              ))}
            </div>

            {/* Nome do cliente — só faz sentido em venda */}
            {tipoGerenciar === "venda" && (
              <div className="px-5 py-3 border-b border-cinza-800 shrink-0">
                <input
                  type="text"
                  value={clienteGerenciar}
                  onChange={e => setClienteGerenciar(e.target.value)}
                  placeholder="Nome do cliente (opcional)"
                  className="w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-red-500/60 transition-colors"
                />
              </div>
            )}

            {/* Corpo: lista de sabores adicionados, ou o picker */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
              {!pickerAberto ? (
                <>
                  {itensGerenciarAtivos.length === 0 ? (
                    <div className="text-center text-cinza-350 text-sm py-10">
                      Nenhum sabor adicionado ainda
                    </div>
                  ) : (
                    <div className="bg-cinza-950/40 border border-cinza-800 rounded-xl overflow-hidden mb-3">
                      {itensGerenciarAtivos.map((p, i) => {
                        const qty = itensGerenciar[p.id];
                        return (
                          <div key={p.id}
                            className={`flex items-center gap-3 px-3 py-2.5 ${i < itensGerenciarAtivos.length - 1 ? "border-b border-cinza-850" : ""}`}>
                            <IconeProduto p={p} size={28} />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-cinza-50 truncate">{p.nome}</div>
                              <div className="text-[10px] text-cinza-350 mt-0.5">
                                {fmtQtd(p.estoque_atual, p.unidade)}
                                {p.preco && (
                                  <span className={`ml-2 ${tipoGerenciar === "venda" ? "text-red-400/80" : "text-emerald-400/80"}`}>
                                    = {fmtMoeda(qty * p.preco)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => adjItemGerenciar(p.id, -1)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-cinza-700 text-cinza-200 hover:border-cinza-500 hover:text-cinza-50 transition-colors text-sm font-bold">
                                −
                              </button>
                              <div className="w-8 text-center text-sm font-semibold text-cinza-50">
                                {qty}
                              </div>
                              <button
                                onClick={() => adjItemGerenciar(p.id, 1)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-cinza-700 text-cinza-200 hover:border-cinza-500 hover:text-cinza-50 transition-colors text-sm font-bold">
                                +
                              </button>
                              <button
                                onClick={() => removerItemGerenciar(p.id)}
                                title="Remover"
                                className="ml-1 w-6 h-6 flex items-center justify-center rounded-lg text-cinza-350 hover:text-red-400 hover:bg-red-500/10 transition-colors text-xs">
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <button onClick={() => setPickerAberto(true)}
                    className="w-full py-2.5 rounded-xl border border-dashed border-cinza-700 text-cinza-200 hover:border-roxo-700 hover:text-roxo-400 transition-colors text-xs font-semibold">
                    + Adicionar sabor
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3 sticky top-0 bg-cinza-900 py-1 z-10">
                    <span className="text-xs text-cinza-200">Ajuste as quantidades</span>
                    <button onClick={() => setPickerAberto(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-roxo-700 hover:bg-roxo-600 text-white transition-colors">
                      Concluir
                    </button>
                  </div>
                  {porCategoria.map(({ cat, itens }) => (
                    <div key={cat} className="mb-4">
                      <div className="text-[10px] text-cinza-350 tracking-widest font-medium px-1 mb-2 uppercase">{cat}</div>
                      <div className="bg-cinza-950/40 border border-cinza-800 rounded-xl overflow-hidden">
                        {itens.map((p, i) => {
                          const qty = itensGerenciar[p.id] || 0;
                          return (
                            <div key={p.id}
                              className={`flex items-center gap-3 px-3 py-2.5 transition-colors
                                ${qty > 0 ? "bg-roxo-700/10" : ""}
                                ${i < itens.length - 1 ? "border-b border-cinza-850" : ""}`}>
                              <IconeProduto p={p} size={28} />
                              <span className={`flex-1 text-xs truncate ${qty > 0 ? "text-roxo-400 font-medium" : "text-cinza-50"}`}>
                                {p.nome}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => adjItemGerenciar(p.id, -1)}
                                  disabled={qty === 0}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-cinza-700 text-cinza-200 hover:border-cinza-500 hover:text-cinza-50 disabled:opacity-30 transition-colors text-sm font-bold">
                                  −
                                </button>
                                <div className="w-6 text-center text-xs font-semibold text-cinza-50">
                                  {qty || "—"}
                                </div>
                                <button
                                  onClick={() => adjItemGerenciar(p.id, 1)}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-cinza-700 text-cinza-200 hover:border-cinza-500 hover:text-cinza-50 transition-colors text-sm font-bold">
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Footer: resumo + ações */}
            <div className="px-5 py-4 border-t border-cinza-800 shrink-0 flex flex-col gap-3">
              {itensGerenciarAtivos.length > 0 && !pickerAberto && (
                <div className="flex items-center justify-between">
                  <div className="text-xs text-cinza-200">
                    {itensGerenciarAtivos.length} sabor{itensGerenciarAtivos.length > 1 ? "es" : ""}
                    {tipoGerenciar === "venda" && clienteGerenciar && <span className="text-cinza-350"> · {clienteGerenciar}</span>}
                  </div>
                  {gerenciarTotalR > 0 && (
                    <div className={`text-sm font-bold ${tipoGerenciar === "venda" ? "text-red-400" : "text-emerald-400"}`}>
                      {fmtMoeda(gerenciarTotalR)}
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={fecharGerenciar}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold border border-cinza-700 text-cinza-200 hover:border-cinza-600 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={registrarGerenciar}
                  disabled={salvandoGerenciar || itensGerenciarAtivos.length === 0}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 text-white transition-colors
                    ${tipoGerenciar === "venda" ? "bg-red-500/80 hover:bg-red-500" : "bg-emerald-500/80 hover:bg-emerald-500"}`}>
                  {salvandoGerenciar ? "Salvando..." : `Registrar${itensGerenciarAtivos.length > 0 ? ` (${itensGerenciarAtivos.length})` : ""}`}
                </button>
              </div>
            </div>
        </div>
      </Modal>

      {/* ── Modal de Contagem de Estoque ─────────────── */}
      <Modal open={modoContagem} onClose={fecharContagem} align="bottom">
        {(() => {
          const itensTxt = parsearTexto(textoContagem);
          const resolvidosTxt = resolverProdutosTexto(itensTxt);
          const alteradosTxt = resolvidosTxt.filter(i => i.produto && i.quantidade !== Number(i.produto.estoque_atual));
          const naoEncontradosTxt = resolvidosTxt.filter(i => !i.produto);
          const alteradosForm = Object.keys(contagens).filter(id => {
            const p = produtos.find(x => x.id === id);
            if (!p || contagens[id] === "") return false;
            return parseFloat(String(contagens[id]).replace(",", ".")) !== Number(p.estoque_atual);
          });

          return (
            <div className="bg-cinza-900 border border-cinza-700 rounded-2xl w-full max-w-lg mx-auto flex flex-col max-h-[88vh] sm:max-h-[75vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-cinza-800 shrink-0">
                <div>
                  <div className="text-sm font-semibold text-cinza-50">Contagem de Estoque</div>
                  <div className="flex gap-1.5 mt-1.5">
                    {["formulario", "texto"].map(a => (
                      <button key={a} onClick={() => setAbaContagem(a)}
                        className={`px-2.5 py-0.5 rounded-md text-[10px] font-medium border transition-all
                          ${abaContagem === a
                            ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                            : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
                        {a === "formulario" ? "📋 Formulário" : "📝 Texto"}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={fecharContagem}
                  className="text-cinza-200 hover:text-cinza-50 transition-colors text-xl leading-none">
                  ✕
                </button>
              </div>

              {/* Corpo */}
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
                {abaContagem === "formulario" ? (
                  <>
                    {alteradosForm.length > 0 && (
                      <div className="mb-3 -mt-1 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20">
                        <span className="text-[11px] text-sky-400">
                          {alteradosForm.length} produto(s) com valor diferente do atual
                        </span>
                      </div>
                    )}
                    {porCategoria.map(({ cat, itens }) => (
                      <div key={cat} className="mb-4">
                        <div className="text-[10px] text-cinza-350 tracking-widest font-medium px-1 mb-2 uppercase">{cat}</div>
                        <div className="bg-cinza-950/40 border border-cinza-800 rounded-xl overflow-hidden">
                          {itens.map((p, i) => {
                            const val = contagens[p.id] ?? "";
                            const novoVal = val !== "" ? parseFloat(String(val).replace(",", ".")) : null;
                            const mudou = novoVal !== null && novoVal !== Number(p.estoque_atual);
                            return (
                              <div key={p.id}
                                className={`flex items-center gap-3 px-3 py-2.5 transition-colors
                                  ${mudou ? "bg-sky-500/5" : ""}
                                  ${i < itens.length - 1 ? "border-b border-cinza-850" : ""}`}>
                                <div className="flex-1 min-w-0 flex items-center gap-2">
                                  <IconeProduto p={p} size={26} />
                                  <div className="min-w-0">
                                    <div className="text-xs text-cinza-50 truncate">{p.nome}</div>
                                    <div className="text-[10px] text-cinza-350 mt-0.5">
                                      atual: {fmtQtd(p.estoque_atual, p.unidade)}
                                      {mudou && (
                                        <span className={`ml-2 font-medium ${novoVal > Number(p.estoque_atual) ? "text-emerald-400" : "text-red-400"}`}>
                                          → {fmtQtd(novoVal, p.unidade)}
                                          {novoVal > Number(p.estoque_atual)
                                            ? ` (+${(novoVal - Number(p.estoque_atual)).toLocaleString("pt-BR", { minimumFractionDigits: 1 })})`
                                            : ` (${(novoVal - Number(p.estoque_atual)).toLocaleString("pt-BR", { minimumFractionDigits: 1 })})`}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <input
                                    type="number" inputMode="decimal" min="0" step="0.1"
                                    value={val}
                                    onChange={e => setContagens(prev => ({ ...prev, [p.id]: e.target.value }))}
                                    placeholder={Number(p.estoque_atual).toLocaleString("pt-BR", { minimumFractionDigits: 1 })}
                                    className={`w-20 text-right bg-cinza-850 border rounded-lg px-2 py-1.5 text-xs text-cinza-50 placeholder-cinza-300 outline-none transition-colors
                                      ${mudou ? "border-sky-500/60 focus:border-sky-400" : "border-cinza-700 focus:border-roxo-700"}`}
                                  />
                                  <span className="text-[10px] text-cinza-350 w-4">{p.unidade}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div>
                      <div className="text-[10px] text-cinza-200 uppercase tracking-wider mb-2">
                        Cole ou digite a lista no formato: <span className="text-roxo-400">Produto — quantidade kg/un</span>
                      </div>
                      <textarea
                        value={textoContagem}
                        onChange={e => setTextoContagem(e.target.value)}
                        placeholder={"Abacaxi — 5 kg\nMorango — 3 kg\nAçaí 500ml — 6 un"}
                        rows={6}
                        className="w-full bg-cinza-850 border border-cinza-700 rounded-xl px-4 py-3 text-sm text-cinza-50 placeholder-cinza-300 outline-none focus:border-roxo-700 resize-none font-mono leading-relaxed transition-colors"
                      />
                    </div>

                    {itensTxt.length > 0 && (
                      <div>
                        <div className="text-[10px] text-cinza-200 uppercase tracking-wider mb-2">
                          Preview — {alteradosTxt.length} produto(s) serão atualizados
                        </div>
                        <div className="bg-cinza-950/40 border border-cinza-800 rounded-xl overflow-hidden">
                          {resolvidosTxt.map((item, i) => (
                            <div key={i}
                              className={`flex items-center gap-3 px-3 py-2.5
                                ${i < resolvidosTxt.length - 1 ? "border-b border-cinza-850" : ""}`}>
                              {item.produto ? (
                                <>
                                  <IconeProduto p={item.produto} size={26} />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-cinza-50 truncate">{item.produto.nome}</div>
                                    <div className="text-[10px] text-cinza-350">
                                      {fmtQtd(item.produto.estoque_atual, item.produto.unidade)}
                                      {item.quantidade !== Number(item.produto.estoque_atual) && (
                                        <span className={`ml-2 font-medium ${item.quantidade > Number(item.produto.estoque_atual) ? "text-emerald-400" : "text-red-400"}`}>
                                          → {fmtQtd(item.quantidade, item.produto.unidade)}
                                        </span>
                                      )}
                                      {item.quantidade === Number(item.produto.estoque_atual) && (
                                        <span className="ml-2 text-cinza-350">sem alteração</span>
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-[10px] text-emerald-400/70 shrink-0">✓</span>
                                </>
                              ) : (
                                <>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs text-cinza-200 truncate">{item.nome}</div>
                                    <div className="text-[10px] text-red-400/70">produto não encontrado</div>
                                  </div>
                                  <span className="text-[10px] text-red-400/70 shrink-0">✗</span>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                        {naoEncontradosTxt.length > 0 && (
                          <div className="mt-2 text-[10px] text-cinza-350">
                            ⚠️ {naoEncontradosTxt.length} produto(s) não reconhecido(s) serão ignorados
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-cinza-800 shrink-0 flex gap-2">
                <button onClick={fecharContagem}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold border border-cinza-700 text-cinza-200 hover:border-cinza-600 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={abaContagem === "formulario" ? salvarContagem : salvarContagemTexto}
                  disabled={salvandoContagem}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold bg-roxo-700 hover:bg-roxo-600 disabled:opacity-50 text-white transition-colors">
                  {salvandoContagem ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ── Modal de movimentação individual ─────── */}
      <Modal open={modal?.tipo === "mov"} onClose={() => setModal(null)} align="bottom">
        {modalConteudo?.tipo === "mov" && (
          <div className="bg-cinza-900 border border-cinza-700 rounded-2xl w-full max-w-sm mx-auto flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-cinza-800">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-cinza-50">
                  <IconeProduto p={modalConteudo.produto} size={26} />
                  {modalConteudo.produto.nome}
                </div>
                <div className="text-[10px] text-cinza-350 mt-0.5">
                  Estoque atual: {fmtQtd(modalConteudo.produto.estoque_atual, modalConteudo.produto.unidade)}
                </div>
              </div>
              <button onClick={() => setModal(null)}
                className="text-cinza-200 hover:text-cinza-50 transition-colors text-xl leading-none">
                ✕
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              {/* Tipo */}
              <div className="flex gap-2">
                {["entrada", "venda", "consumo"].map(t => (
                  <button key={t} onClick={() => setTipoMov(t)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all
                      ${tipoMov === t
                        ? t === "entrada" ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                          : t === "venda" ? "border-red-500 bg-red-500/15 text-red-400"
                          : "border-amber-500 bg-amber-500/15 text-amber-400"
                        : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
                    {TIPO_LABEL[t]}
                  </button>
                ))}
              </div>

              {/* Quantidade com stepper +/- */}
              <div>
                <label className="text-[10px] text-cinza-200 uppercase tracking-wider">
                  Quantidade ({modalConteudo.produto.unidade})
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    onClick={() => adjQuantidade(-1)}
                    className="w-11 h-11 flex items-center justify-center rounded-xl border border-cinza-700 text-cinza-200 hover:border-cinza-500 hover:text-cinza-50 transition-colors text-lg font-bold shrink-0">
                    −
                  </button>
                  <input
                    type="number" inputMode="decimal" min="0" step="1"
                    value={quantidade} onChange={e => setQuantidade(e.target.value)}
                    placeholder="0" autoFocus
                    className="flex-1 text-center bg-cinza-850 border border-cinza-700 rounded-xl px-3 py-2.5 text-sm font-semibold text-cinza-50 placeholder-cinza-350 outline-none focus:border-roxo-700 transition-colors"
                  />
                  <button
                    onClick={() => adjQuantidade(1)}
                    className="w-11 h-11 flex items-center justify-center rounded-xl border border-cinza-700 text-cinza-200 hover:border-cinza-500 hover:text-cinza-50 transition-colors text-lg font-bold shrink-0">
                    +
                  </button>
                </div>
              </div>

              {/* Pessoa — só para consumo */}
              {tipoMov === "consumo" && (
                <div>
                  <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Pessoa</label>
                  <input
                    type="text" value={pessoa} onChange={e => setPessoa(e.target.value)}
                    placeholder="Nome (opcional)"
                    className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-roxo-700 transition-colors"
                  />
                </div>
              )}

              {/* Observação */}
              <div>
                <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Observação</label>
                <input
                  type="text" value={obs} onChange={e => setObs(e.target.value)}
                  placeholder="Opcional"
                  className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-roxo-700 transition-colors"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-cinza-800 flex gap-2">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold border border-cinza-700 text-cinza-200 hover:border-cinza-600 transition-colors">
                Cancelar
              </button>
              <button onClick={registrarMovimentacao} disabled={salvando || !quantidade || Number(quantidade) <= 0}
                className="flex-1 py-2 bg-roxo-700 hover:bg-roxo-600 disabled:opacity-50 rounded-lg text-xs font-semibold text-white transition-colors">
                {salvando ? "Salvando..." : "Registrar"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal de edição ──────────────────────── */}
      <Modal open={modal?.tipo === "editar"} onClose={() => setModal(null)} align="bottom">
        {modalConteudo?.tipo === "editar" && (
          <div className="bg-cinza-900 border border-cinza-700 rounded-2xl w-full max-w-sm mx-auto flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-cinza-800">
              <span className="text-sm font-semibold text-cinza-50">Editar produto</span>
              <button onClick={() => setModal(null)}
                className="text-cinza-200 hover:text-cinza-50 transition-colors text-xl leading-none">
                ✕
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-4">
              <div className="flex gap-3 items-start">
                <div className="shrink-0 flex flex-col items-center gap-1.5">
                  <div className="w-20 h-20 rounded-xl bg-cinza-850 border border-cinza-700 flex items-center justify-center overflow-hidden">
                    <IconeProduto p={{ emoji: editEmoji, icone_url: editIconeUrl }} size={44} />
                  </div>
                  <label className={`text-[9px] font-medium cursor-pointer transition-colors
                    ${enviandoIcone ? "text-cinza-350" : "text-roxo-400 hover:text-roxo-300"}`}>
                    {enviandoIcone ? "Enviando..." : "📷 Imagem"}
                    <input type="file" accept="image/*" className="hidden" disabled={enviandoIcone}
                      onChange={e => enviarIcone(e.target.files?.[0])} />
                  </label>
                  {editIconeUrl && !enviandoIcone && (
                    <button type="button" onClick={() => setEditIconeUrl("")}
                      className="text-[9px] text-cinza-350 hover:text-red-400 transition-colors">
                      remover
                    </button>
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-3">
                  <div>
                    <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Nome</label>
                    <input type="text" value={editNome} onChange={e => setEditNome(e.target.value)}
                      className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 outline-none focus:border-roxo-700 transition-colors" />
                  </div>
                  <div>
                    <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Emoji (se não tiver imagem)</label>
                    <input type="text" value={editEmoji} onChange={e => setEditEmoji(e.target.value)}
                      placeholder={EMOJI_PADRAO} maxLength={4}
                      className="mt-1.5 w-20 text-center bg-cinza-850 border border-cinza-700 rounded-lg px-2 py-2 text-base outline-none focus:border-roxo-700 transition-colors" />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-cinza-200 uppercase tracking-wider">
                  Estoque mínimo ({modalConteudo.produto.unidade})
                </label>
                <input type="number" inputMode="decimal" min="0" step="0.5"
                  value={editMin} onChange={e => setEditMin(e.target.value)}
                  className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 outline-none focus:border-roxo-700 transition-colors" />
              </div>
              <div>
                <label className="text-[10px] text-cinza-200 uppercase tracking-wider">
                  Preço de venda (R$/{modalConteudo.produto.unidade})
                </label>
                <input type="number" inputMode="decimal" min="0" step="0.01"
                  value={editPreco} onChange={e => setEditPreco(e.target.value)}
                  placeholder="Não definido"
                  className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-roxo-700 transition-colors" />
              </div>

              <div className="pt-1 border-t border-cinza-800">
                {!confirmandoRemocao ? (
                  <button type="button" onClick={() => setConfirmandoRemocao(true)}
                    className="mt-3 text-[11px] text-cinza-350 hover:text-red-400 transition-colors">
                    🗑 Remover produto
                  </button>
                ) : (
                  <div className="mt-3 flex flex-col gap-2">
                    <span className="text-[11px] text-red-400">
                      Remover "{editNome}"? Sai da lista de estoque — o histórico de movimentações continua.
                    </span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirmandoRemocao(false)}
                        className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold border border-cinza-700 text-cinza-200 hover:border-cinza-600 transition-colors">
                        Cancelar
                      </button>
                      <button type="button" onClick={removerProduto} disabled={salvando}
                        className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-red-500/80 hover:bg-red-500 disabled:opacity-50 text-white transition-colors">
                        {salvando ? "Removendo..." : "Sim, remover"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-cinza-800 flex gap-2">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold border border-cinza-700 text-cinza-200 hover:border-cinza-600 transition-colors">
                Cancelar
              </button>
              <button onClick={salvarEdicao} disabled={salvando}
                className="flex-1 py-2 bg-roxo-700 hover:bg-roxo-600 disabled:opacity-50 rounded-lg text-xs font-semibold text-white transition-colors">
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal de novo produto ────────────────── */}
      <Modal open={modal?.tipo === "novo"} onClose={() => setModal(null)} align="bottom">
        {modalConteudo?.tipo === "novo" && (
          <div className="bg-cinza-900 border border-cinza-700 rounded-2xl w-full max-w-sm mx-auto flex flex-col max-h-[88vh] sm:max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-cinza-800 shrink-0">
              <span className="text-sm font-semibold text-cinza-50">Novo produto</span>
              <button onClick={() => setModal(null)}
                className="text-cinza-200 hover:text-cinza-50 transition-colors text-xl leading-none">
                ✕
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              <div className="flex gap-3 items-start">
                <div className="shrink-0 flex flex-col items-center gap-1.5">
                  <div className="w-20 h-20 rounded-xl bg-cinza-850 border border-cinza-700 flex items-center justify-center overflow-hidden">
                    <IconeProduto p={{ emoji: novoEmoji, icone_url: novoIconeUrl }} size={44} />
                  </div>
                  <label className={`text-[9px] font-medium cursor-pointer transition-colors
                    ${enviandoIconeNovo ? "text-cinza-350" : "text-roxo-400 hover:text-roxo-300"}`}>
                    {enviandoIconeNovo ? "Enviando..." : "📷 Imagem"}
                    <input type="file" accept="image/*" className="hidden" disabled={enviandoIconeNovo}
                      onChange={e => enviarIconeNovo(e.target.files?.[0])} />
                  </label>
                  {novoIconeUrl && !enviandoIconeNovo && (
                    <button type="button" onClick={() => setNovoIconeUrl("")}
                      className="text-[9px] text-cinza-350 hover:text-red-400 transition-colors">
                      remover
                    </button>
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-3">
                  <div>
                    <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Nome</label>
                    <input type="text" value={novoNome} onChange={e => setNovoNome(e.target.value)}
                      placeholder="Ex: Morango" autoFocus
                      className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-roxo-700 transition-colors" />
                  </div>
                  <div>
                    <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Emoji (se não tiver imagem)</label>
                    <input type="text" value={novoEmoji} onChange={e => setNovoEmoji(e.target.value)}
                      placeholder={EMOJI_PADRAO} maxLength={4}
                      className="mt-1.5 w-20 text-center bg-cinza-850 border border-cinza-700 rounded-lg px-2 py-2 text-base outline-none focus:border-roxo-700 transition-colors" />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Categoria</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {CATEGORIAS.map(c => (
                    <button key={c} type="button" onClick={() => setNovoCategoria(c)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all
                        ${novoCategoria === c
                          ? "border-roxo-700 bg-roxo-700/15 text-roxo-400"
                          : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] text-cinza-200 uppercase tracking-wider">Unidade</label>
                <div className="mt-1.5 flex gap-2">
                  {["kg", "un"].map(u => (
                    <button key={u} type="button" onClick={() => setNovoUnidade(u)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all
                        ${novoUnidade === u
                          ? "border-roxo-700 bg-roxo-700/15 text-roxo-400"
                          : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
                      {u === "kg" ? "Quilos (kg)" : "Unidade (un)"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] text-cinza-200 uppercase tracking-wider">
                  Estoque mínimo ({novoUnidade})
                </label>
                <input type="number" inputMode="decimal" min="0" step="0.5"
                  value={novoMin} onChange={e => setNovoMin(e.target.value)}
                  placeholder="0"
                  className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-roxo-700 transition-colors" />
              </div>

              <div>
                <label className="text-[10px] text-cinza-200 uppercase tracking-wider">
                  Preço de venda (R$/{novoUnidade})
                </label>
                <input type="number" inputMode="decimal" min="0" step="0.01"
                  value={novoPreco} onChange={e => setNovoPreco(e.target.value)}
                  placeholder="Não definido"
                  className="mt-1.5 w-full bg-cinza-850 border border-cinza-700 rounded-lg px-3 py-2.5 text-sm text-cinza-50 placeholder-cinza-350 outline-none focus:border-roxo-700 transition-colors" />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-cinza-800 shrink-0 flex gap-2">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold border border-cinza-700 text-cinza-200 hover:border-cinza-600 transition-colors">
                Cancelar
              </button>
              <button onClick={criarProduto} disabled={salvando || !novoNome.trim()}
                className="flex-1 py-2 bg-roxo-700 hover:bg-roxo-600 disabled:opacity-50 rounded-lg text-xs font-semibold text-white transition-colors">
                {salvando ? "Criando..." : "Criar produto"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
