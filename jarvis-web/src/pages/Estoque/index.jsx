import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import { useHeader } from "../../contexts/useHeader";
import { CATEGORIAS, fmtQtd, produtosParaLocal } from "./format";
import AbaEstoque from "./AbaEstoque";
import AbaHistorico from "./AbaHistorico";
import AbaFinanceiro from "./AbaFinanceiro";
import AbaTabela from "./AbaTabela";
import ModalMovimentacao from "./ModalMovimentacao";
import ModalEditarProduto from "./ModalEditarProduto";
import ModalNovoProduto from "./ModalNovoProduto";
import ModalGerenciar from "./ModalGerenciar";
import ModalContagem from "./ModalContagem";
import ModalFaltantes from "./ModalFaltantes";
import ModalLancamento from "./ModalLancamento";

/**
 * Página de Estoque (câmara/freezer de polpas). Orquestra o carregamento
 * de produtos/movimentações e todas as operações que gravam no Supabase;
 * cada modal (Movimentação, Editar, Novo produto, Gerenciar, Contagem,
 * Faltantes) é um componente à parte em ./Estoque/ que só cuida do
 * próprio formulário e chama de volta uma função `on*` daqui quando
 * precisa persistir algo. Ver os comentários de cada arquivo pra mais
 * detalhes de responsabilidade.
 */
export default function Estoque() {
  const { setCfg } = useHeader();
  const [produtos, setProdutos] = useState([]);
  const [movs, setMovs] = useState([]);
  const [lancamentos, setLancamentos] = useState([]);
  const [categoriasDespesa, setCategoriasDespesa] = useState([]);
  const [aba, setAba] = useState("estoque");
  const [local, setLocal] = useState("freezer"); // "freezer" | "camara_fria" — estoques independentes
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // View dos produtos escopada pro local ativo: freezer é o objeto original
  // (as colunas "sem sufixo" já são dele, então quem só lê estoque_atual/
  // estoque_minimo continua funcionando sem saber que existe câmara fria);
  // câmara fria remapeia pros campos "_camara" nesses mesmos nomes.
  const produtosView = useMemo(() => produtosParaLocal(produtos, local), [produtos, local]);

  // Modal de movimentação/edição: precisa lembrar o produto-alvo mesmo
  // depois de "fechado", pra não piscar vazio durante a animação de saída
  // do Modal (~200ms) — daí o par modal/modalConteudo em vez de um único
  // estado.
  const [modal, setModal] = useState(null); // { tipo: "mov" | "editar", produto } | null
  const [modalConteudo, setModalConteudo] = useState(null);
  if (modal && modal !== modalConteudo) setModalConteudo(modal);

  const [modoGerenciar, setModoGerenciar] = useState(false);
  const [modoContagem, setModoContagem] = useState(false);
  const [modoNovoProduto, setModoNovoProduto] = useState(false);
  const [modoFaltantes, setModoFaltantes] = useState(false);

  // Mesmo par estado/conteúdo dos outros modais, pra não piscar vazio
  // durante a animação de saída. { lancamento: object|null } — lancamento
  // null significa "nova despesa".
  const [modalLancamento, setModalLancamento] = useState(null);
  const [modalLancConteudo, setModalLancConteudo] = useState(null);
  if (modalLancamento && modalLancamento !== modalLancConteudo) setModalLancConteudo(modalLancamento);

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

  async function carregarLancamentos() {
    const { data } = await supabase
      .from("psh_lancamentos")
      .select("*")
      .order("data", { ascending: false })
      .limit(500);
    if (data) setLancamentos(data);
  }

  async function carregarCategoriasDespesa() {
    const { data } = await supabase
      .from("categorias")
      .select("nome")
      .eq("tipo", "psh_despesa")
      .order("nome");
    if (data) setCategoriasDespesa(data.map(c => c.nome));
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([
        carregarProdutos(), carregarMovs(),
        carregarLancamentos(), carregarCategoriasDespesa(),
      ]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const alertas = produtosView.filter(p => Number(p.estoque_atual) < Number(p.estoque_minimo)).length;
    const totalKg = produtosView
      .filter(p => p.unidade === "kg")
      .reduce((s, p) => s + Number(p.estoque_atual), 0);
    setCfg({
      title: "Polpa SH",
      subtitle: alertas > 0
        ? `${totalKg.toFixed(1)} kg · ⚠️ ${alertas} abaixo do mínimo`
        : `${totalKg.toFixed(1)} kg · tudo ok`,
      // Os botões de operação são todos sobre o estoque de um local; nas
      // abas Financeiro e Tabela (que são visões consolidadas, sem local)
      // eles não teriam a que se referir.
      // No celular fica só o emoji: os quatro rótulos ("🔄 Gerenciar",
      // "📋 Contagem"…) disputavam a primeira linha com o título e
      // sobrava uma tira de ~120px com scroll horizontal. Só emoji cabe
      // ao lado do título sem rolagem; o rótulo volta a partir de `sm`.
      right: aba === "estoque" || aba === "historico" ? (
        <div className="flex gap-1.5 sm:gap-2">
          <button
            onClick={() => setModoGerenciar(true)}
            title="Gerenciar" aria-label="Gerenciar estoque"
            className="text-xs px-2.5 sm:px-3 py-1.5 sm:py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors whitespace-nowrap shrink-0">
            🔄<span className="hidden sm:inline"> Gerenciar</span>
          </button>
          <button
            onClick={() => setModoContagem(true)}
            title="Contagem" aria-label="Contagem de estoque"
            className="text-xs px-2.5 sm:px-3 py-1.5 sm:py-1 rounded-full bg-cinza-850 border border-cinza-700 text-cinza-200 hover:border-roxo-700 hover:text-roxo-400 transition-colors whitespace-nowrap shrink-0">
            📋<span className="hidden sm:inline"> Contagem</span>
          </button>
          <button
            onClick={() => setModoFaltantes(true)}
            title="Faltantes" aria-label="Lista de faltantes"
            className="text-xs px-2.5 sm:px-3 py-1.5 sm:py-1 rounded-full bg-cinza-850 border border-cinza-700 text-cinza-200 hover:border-roxo-700 hover:text-roxo-400 transition-colors whitespace-nowrap shrink-0">
            {local === "freezer" ? "🧊" : "❄️"}<span className="hidden sm:inline"> Faltantes</span>
          </button>
          <button
            onClick={() => setModoNovoProduto(true)}
            title="Novo produto" aria-label="Novo produto"
            className="text-xs px-2.5 sm:px-3 py-1.5 sm:py-1 rounded-full bg-roxo-700/10 border border-roxo-700/30 text-roxo-400 hover:bg-roxo-700/20 transition-colors whitespace-nowrap shrink-0">
            +<span className="hidden sm:inline"> Produto</span>
          </button>
        </div>
      ) : null,
      // No celular as pílulas ocupam a largura toda em partes iguais
      // (`flex-1`) em vez de rolarem na horizontal: quatro abas com emoji
      // + rótulo somavam mais que a tela, e a última ficava escondida sem
      // nenhuma pista de que existia. O emoji sai abaixo de `sm` porque é
      // o que faz "Financeiro" não caber.
      secondRow: (
        <div className="flex flex-col gap-2">
          {aba === "estoque" && (
            <div className="flex gap-2">
              {[["freezer", "🧊", "Freezer"], ["camara_fria", "❄️", "Câmara fria"]].map(([l, icone, label]) => (
                <button key={l} onClick={() => setLocal(l)}
                  className={`flex-1 sm:flex-none px-3 py-1.5 sm:py-1 rounded-lg text-xs font-medium border transition-all
                    ${local === l
                      ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                      : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
                  {icone} {label}
                </button>
              ))}
            </div>
          )}
          {/* data-testid nas abas: o nome acessível do botão muda entre
              breakpoints (o emoji só aparece a partir de `sm`), então os
              testes e2e casariam em um projeto e falhariam no outro. */}
          <div className="flex gap-1.5 sm:gap-2">
            {[["estoque", "📦", "Estoque"], ["historico", "📋", "Histórico"],
              ["financeiro", "💰", "Financeiro"], ["tabela", "📊", "Tabela"]].map(([a, icone, label]) => (
              <button key={a} onClick={() => setAba(a)} data-testid={`aba-${a}`}
                className={`flex-1 sm:flex-none px-2 sm:px-3 py-1.5 sm:py-1 rounded-lg text-xs font-medium border transition-all whitespace-nowrap
                  ${aba === a
                    ? "border-roxo-700 bg-roxo-700/13 text-roxo-400"
                    : "border-cinza-700 text-cinza-200 hover:border-cinza-600"}`}>
                <span className="hidden sm:inline">{icone} </span>{label}
              </button>
            ))}
          </div>
        </div>
      ),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtosView, aba, local]);

  // ── Movimentação individual (ModalMovimentacao) ──────────────────
  // "transferencia" só existe no freezer: é o mesmo produto saindo da
  // câmara fria e entrando no freezer, então mexe nas duas colunas numa
  // única atualização em vez de duas movimentações separadas.
  async function registrarMovimentacao(produto, { tipo, quantidade, pessoa, obs }) {
    if (tipo === "transferencia") {
      if (quantidade > Number(produto.estoque_atual_camara)) {
        showToast("Câmara fria não tem esse saldo", false);
        return false;
      }
      const novoFreezer = Number(produto.estoque_atual) + quantidade;
      const novoCamara = Math.max(0, Number(produto.estoque_atual_camara) - quantidade);

      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from("estoque_movimentacoes").insert({
          produto_id: produto.id,
          tipo: "transferencia",
          quantidade,
          local: "freezer",
          observacao: obs.trim() || null,
        }),
        supabase.from("estoque_produtos")
          .update({ estoque_atual: novoFreezer, estoque_atual_camara: novoCamara })
          .eq("id", produto.id),
      ]);

      if (e1 || e2) {
        showToast("Erro ao registrar", false);
        return false;
      }

      setProdutos(prev => prev.map(x => x.id === produto.id
        ? { ...x, estoque_atual: novoFreezer, estoque_atual_camara: novoCamara }
        : x));
      setMovs(prev => [{
        id: `tmp-${Date.now()}`,
        produto_id: produto.id,
        tipo: "transferencia",
        quantidade,
        local: "freezer",
        observacao: obs.trim() || null,
        criado_em: new Date().toISOString(),
        produto: { nome: produto.nome, unidade: produto.unidade, emoji: produto.emoji, icone_url: produto.icone_url },
      }, ...prev]);
      showToast(`🔄 +${fmtQtd(quantidade, produto.unidade)} transferido da câmara`);
      return true;
    }

    const campoAtual = local === "freezer" ? "estoque_atual" : "estoque_atual_camara";
    const delta = tipo === "entrada" ? quantidade : -quantidade;
    // Sem piso em zero de propósito: é comum lançar a venda antes de
    // registrar a transferência da câmara, e o saldo negativo é o que
    // mostra que a transferência ainda falta. Truncar em 0 apagaria essa
    // informação e o estoque nunca fecharia depois.
    const novoEstoque = Number(produto.estoque_atual) + delta;

    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("estoque_movimentacoes").insert({
        produto_id: produto.id,
        tipo,
        quantidade,
        local,
        pessoa: tipo === "consumo" ? (pessoa.trim() || null) : null,
        observacao: obs.trim() || null,
      }),
      supabase.from("estoque_produtos").update({ [campoAtual]: novoEstoque }).eq("id", produto.id),
    ]);

    if (e1 || e2) {
      showToast("Erro ao registrar", false);
      return false;
    }

    setProdutos(prev => prev.map(x => x.id === produto.id ? { ...x, [campoAtual]: novoEstoque } : x));
    setMovs(prev => [{
      id: `tmp-${Date.now()}`,
      produto_id: produto.id,
      tipo,
      quantidade,
      local,
      pessoa: tipo === "consumo" ? (pessoa.trim() || null) : null,
      observacao: obs.trim() || null,
      criado_em: new Date().toISOString(),
      produto: { nome: produto.nome, unidade: produto.unidade, emoji: produto.emoji, icone_url: produto.icone_url },
    }, ...prev]);
    showToast(tipo === "entrada"
      ? `+${fmtQtd(quantidade, produto.unidade)} adicionado`
      : `−${fmtQtd(quantidade, produto.unidade)} registrado`);
    // Venda e entrada viram lançamento financeiro pelo trigger do banco.
    if (tipo === "venda" || tipo === "entrada") carregarLancamentos();
    return true;
  }

  // ── Editar produto (ModalEditarProduto) ──────────────────────────
  async function salvarEdicao(produto, updates) {
    const { error } = await supabase.from("estoque_produtos").update(updates).eq("id", produto.id);
    if (error) {
      showToast("Erro ao salvar", false);
      return false;
    }
    setProdutos(prev => prev.map(x => x.id === produto.id ? { ...x, ...updates } : x));
    showToast("Produto atualizado");
    return true;
  }

  // Desativa em vez de excluir (mesma convenção de "ativo" usada no resto do
  // projeto, ex: encerrar semestre em faculdade_aulas) — preserva o
  // histórico de movimentações em vez de apagar tudo via cascade.
  async function removerProduto(produto) {
    const { error } = await supabase.from("estoque_produtos").update({ ativo: false }).eq("id", produto.id);
    if (error) {
      showToast("Erro ao remover produto", false);
      return false;
    }
    setProdutos(prev => prev.filter(x => x.id !== produto.id));
    showToast("Produto removido");
    return true;
  }

  // ── Novo produto (ModalNovoProduto) ──────────────────────────────
  async function criarProduto(dados) {
    const { data, error } = await supabase.from("estoque_produtos").insert(dados).select().single();
    if (error) {
      showToast("Erro ao criar produto", false);
      return false;
    }
    setProdutos(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
    showToast("Produto criado");
    return true;
  }

  // ── Gerenciar em lote (ModalGerenciar) ───────────────────────────
  // localAlvo vem do toggle interno do modal (independente do toggle da
  // página) — é assim que dá pra lançar uma entrada grande na câmara fria
  // sem precisar trocar a aba "Estoque" pra câmara fria antes.
  async function registrarGerenciar(tipo, itens, cliente, localAlvo) {
    const produtosAlvo = produtosParaLocal(produtos, localAlvo);
    const itensAtivos = produtosAlvo.filter(p => (itens[p.id] || 0) > 0);
    if (itensAtivos.length === 0) return false;

    if (tipo === "transferencia") {
      const semSaldo = itensAtivos.find(p => itens[p.id] > Number(p.estoque_atual_camara));
      if (semSaldo) {
        showToast(`Câmara fria não tem saldo suficiente de ${semSaldo.nome}`, false);
        return false;
      }

      const agora = new Date().toISOString();
      const insertsMovs = itensAtivos.map(p => ({
        produto_id: p.id,
        tipo: "transferencia",
        quantidade: itens[p.id],
        local: "freezer",
        observacao: null,
        criado_em: agora,
      }));

      const { error } = await supabase.from("estoque_movimentacoes").insert(insertsMovs);
      if (error) {
        showToast("Erro ao registrar", false);
        return false;
      }

      await Promise.all(itensAtivos.map(p => {
        const novoFreezer = Number(p.estoque_atual) + itens[p.id];
        const novoCamara = Math.max(0, Number(p.estoque_atual_camara) - itens[p.id]);
        return supabase.from("estoque_produtos")
          .update({ estoque_atual: novoFreezer, estoque_atual_camara: novoCamara })
          .eq("id", p.id);
      }));

      setProdutos(prev => prev.map(p => {
        const qty = itens[p.id];
        if (!qty) return p;
        return {
          ...p,
          estoque_atual: Number(p.estoque_atual) + qty,
          estoque_atual_camara: Math.max(0, Number(p.estoque_atual_camara) - qty),
        };
      }));

      setMovs(prev => [
        ...insertsMovs.map((m, i) => ({
          ...m,
          id: `tmp-ger-${Date.now()}-${i}`,
          produto: { nome: itensAtivos[i].nome, unidade: itensAtivos[i].unidade, emoji: itensAtivos[i].emoji, icone_url: itensAtivos[i].icone_url },
        })),
        ...prev,
      ]);

      showToast(`🔄 ${itensAtivos.length} sabor(es) transferido(s) da câmara`);
      return true;
    }

    const campoAtual = localAlvo === "freezer" ? "estoque_atual" : "estoque_atual_camara";
    const agora = new Date().toISOString();
    const sinal = tipo === "entrada" ? 1 : -1;

    const insertsMovs = itensAtivos.map(p => ({
      produto_id: p.id,
      tipo,
      quantidade: itens[p.id],
      local: localAlvo,
      pessoa: tipo === "venda" ? (cliente.trim() || null) : null,
      observacao: null,
      criado_em: agora,
    }));

    const { error } = await supabase.from("estoque_movimentacoes").insert(insertsMovs);
    if (error) {
      showToast("Erro ao registrar", false);
      return false;
    }

    // Sem piso em zero — mesmo motivo do registrarMovimentacao: venda
    // lançada antes da transferência deve deixar o saldo negativo.
    await Promise.all(itensAtivos.map(p => {
      const novoEstoque = Number(p.estoque_atual) + sinal * itens[p.id];
      return supabase.from("estoque_produtos").update({ [campoAtual]: novoEstoque }).eq("id", p.id);
    }));

    setProdutos(prev => prev.map(p => {
      const qty = itens[p.id];
      if (!qty) return p;
      return { ...p, [campoAtual]: Number(p[campoAtual]) + sinal * qty };
    }));

    setMovs(prev => [
      ...insertsMovs.map((m, i) => ({
        ...m,
        id: `tmp-ger-${Date.now()}-${i}`,
        produto: { nome: itensAtivos[i].nome, unidade: itensAtivos[i].unidade, emoji: itensAtivos[i].emoji, icone_url: itensAtivos[i].icone_url },
      })),
      ...prev,
    ]);

    const totalR = tipo === "venda"
      ? itensAtivos.reduce((s, p) => s + (itens[p.id] * (p.preco || 0)), 0)
      : 0;
    const acao = tipo === "venda" ? "vendido(s)" : "recebido(s)";
    showToast(`${itensAtivos.length} produto(s) ${acao}${totalR > 0 ? ` · R$ ${totalR.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}`);
    // Venda e entrada viram lançamento financeiro pelo trigger do banco.
    carregarLancamentos();
    return true;
  }

  // ── Contagem de estoque (ModalContagem) ──────────────────────────
  // Atende tanto a aba de formulário quanto a de texto — ambas já chegam
  // aqui com a mesma forma { produto, novoVal }[], já filtrada só pelo
  // que de fato mudou.
  async function salvarContagem(alterados, localAlvo) {
    const campoAtual = localAlvo === "freezer" ? "estoque_atual" : "estoque_atual_camara";
    const agora = new Date().toISOString();
    const insertsMovs = alterados.map(({ produto, novoVal }) => ({
      produto_id: produto.id,
      tipo: "contagem",
      quantidade: novoVal,
      local: localAlvo,
      observacao: `era ${fmtQtd(produto.estoque_atual, produto.unidade)} → agora ${fmtQtd(novoVal, produto.unidade)}`,
      criado_em: agora,
    }));

    const { error } = await supabase.from("estoque_movimentacoes").insert(insertsMovs);
    if (error) {
      showToast("Erro ao salvar contagem", false);
      return;
    }

    await Promise.all(alterados.map(({ produto, novoVal }) =>
      supabase.from("estoque_produtos").update({ [campoAtual]: novoVal }).eq("id", produto.id)
    ));

    setProdutos(prev => prev.map(p => {
      const hit = alterados.find(a => a.produto.id === p.id);
      return hit ? { ...p, [campoAtual]: hit.novoVal } : p;
    }));

    setMovs(prev => [
      ...insertsMovs.map((m, i) => ({
        ...m,
        id: `tmp-cont-${Date.now()}-${i}`,
        produto: {
          nome: alterados[i].produto.nome,
          unidade: alterados[i].produto.unidade,
          emoji: alterados[i].produto.emoji,
          icone_url: alterados[i].produto.icone_url,
        },
      })),
      ...prev,
    ]);

    showToast(`${alterados.length} produto${alterados.length > 1 ? "s" : ""} atualizado${alterados.length > 1 ? "s" : ""}`);
  }

  // ── Financeiro do PSH (AbaFinanceiro / ModalLancamento) ──────────
  // Vendas e compras não são criadas aqui: um trigger no banco gera o
  // lançamento a partir da movimentação de estoque (ver
  // migrations/010_psh_financeiro.sql). Por isso todo caminho que grava
  // movimentação chama carregarLancamentos() em vez de montar a linha
  // otimisticamente — só o banco sabe o valor final.
  async function salvarLancamento(dados) {
    if (modalLancamento?.lancamento) {
      const l = modalLancamento.lancamento;
      const updates = { ...dados };
      // Corrigir o valor de um lançamento automático o "congela": sem essa
      // marca, um recálculo futuro de preço sobrescreveria a correção.
      if (l.movimentacao_id && Number(dados.valor) !== Number(l.valor)) updates.editado = true;

      const { error } = await supabase.from("psh_lancamentos").update(updates).eq("id", l.id);
      if (error) {
        showToast("Erro ao salvar lançamento", false);
        return false;
      }
      setLancamentos(prev => prev.map(x => x.id === l.id ? { ...x, ...updates } : x));
      showToast("Lançamento atualizado");
      return true;
    }

    const { data, error } = await supabase
      .from("psh_lancamentos")
      .insert({ ...dados, tipo: "despesa" })
      .select()
      .single();
    if (error) {
      showToast("Erro ao lançar despesa", false);
      return false;
    }
    setLancamentos(prev => [data, ...prev]);
    showToast("Despesa lançada");
    return true;
  }

  async function excluirLancamento(l) {
    const { error } = await supabase.from("psh_lancamentos").delete().eq("id", l.id);
    if (error) {
      showToast("Erro ao excluir", false);
      return false;
    }
    setLancamentos(prev => prev.filter(x => x.id !== l.id));
    showToast("Lançamento excluído");
    return true;
  }

  const porCategoria = CATEGORIAS.map(cat => ({
    cat,
    itens: produtosView.filter(p => p.categoria === cat),
  })).filter(g => g.itens.length > 0);

  const tiposMov = local === "freezer" ? ["transferencia", "venda", "consumo"] : ["entrada", "venda", "consumo"];
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
        <AbaEstoque
          porCategoria={porCategoria}
          onVender={produto => setModal({ tipo: "mov", produto })}
          onEditar={produto => setModal({
            tipo: "editar",
            // Edição é do produto (nome/emoji/preço/os dois mínimos), não do
            // estoque de um local — sempre usa o objeto original, nunca a
            // view remapeada pra câmara (que sobrescreve estoque_minimo).
            produto: produtos.find(x => x.id === produto.id) || produto,
          })}
        />
      ) : aba === "historico" ? (
        <AbaHistorico movs={movs} />
      ) : aba === "financeiro" ? (
        <AbaFinanceiro
          lancamentos={lancamentos}
          produtos={produtos}
          onNovaDespesa={() => setModalLancamento({ lancamento: null })}
          onEditar={l => setModalLancamento({ lancamento: l })}
        />
      ) : (
        <AbaTabela
          produtos={produtos}
          onEditar={produto => setModal({ tipo: "editar", produto })}
        />
      )}

      <ModalMovimentacao
        open={modal?.tipo === "mov"}
        produto={modalConteudo?.tipo === "mov" ? modalConteudo.produto : null}
        tipoInicial="venda"
        tipos={tiposMov}
        onClose={() => setModal(null)}
        onSubmit={registrarMovimentacao}
      />

      <ModalEditarProduto
        open={modal?.tipo === "editar"}
        produto={modalConteudo?.tipo === "editar" ? modalConteudo.produto : null}
        onClose={() => setModal(null)}
        onSalvar={salvarEdicao}
        onRemover={removerProduto}
        showToast={showToast}
      />

      <ModalNovoProduto
        open={modoNovoProduto}
        onClose={() => setModoNovoProduto(false)}
        onCriar={criarProduto}
        showToast={showToast}
      />

      <ModalGerenciar
        open={modoGerenciar}
        produtos={produtos}
        localInicial={local}
        onClose={() => setModoGerenciar(false)}
        onSubmit={registrarGerenciar}
      />

      <ModalContagem
        open={modoContagem}
        produtos={produtos}
        localInicial={local}
        onClose={() => setModoContagem(false)}
        onSalvar={salvarContagem}
      />

      <ModalFaltantes
        open={modoFaltantes}
        produtos={produtosView}
        onClose={() => setModoFaltantes(false)}
        showToast={showToast}
      />

      <ModalLancamento
        open={!!modalLancamento}
        lancamento={modalLancConteudo?.lancamento || null}
        categorias={categoriasDespesa}
        onClose={() => setModalLancamento(null)}
        onSalvar={salvarLancamento}
        onExcluir={excluirLancamento}
      />
    </div>
  );
}
