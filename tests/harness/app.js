// Harness: Vue 2.7 + vue-multiselect 2.x reais, sem build. Dados fictícios.
// O UMD do vue-multiselect expõe window.VueMultiselect (objeto de módulo);
// o componente é VueMultiselect.default (alias: VueMultiselect.Multiselect).
(function () {
  var params = new URLSearchParams(location.search);
  var Multiselect = window.VueMultiselect.default || window.VueMultiselect.Multiselect;
  var counter = 1000;
  var lateTimer = null;

  function emptyState() {
    return {
      descricao: '',
      nbs: '',
      consumo: null,
      governamental: null,
      nome: null,
      interno: '',
      distribuidora: '',
      tipoConta: '',
      debitoAuto: false,
      tipoPessoa: 'Física',
      vencimento: '',
      competencia: '',
    };
  }

  var vm = new Vue({
    el: '#app',
    components: { Multiselect: Multiselect },
    data: function () {
      return Object.assign(emptyState(), {
        mounted: false,
        active: false,
        confirmOpen: false,
        late: false,
        ids: {},
        closeMode: params.get('close') === 'class' ? 'class' : 'if',
        optsConsumo: [
          { id: 0, name: 'Não' },
          { id: 1, name: 'Sim' },
        ],
        optsGov: [
          { id: 10, name: 'Operação Alfa' },
          { id: 11, name: 'Operação Beta' },
        ],
        optsNome: [
          { id: 1, name: 'Ana Exemplo' },
          { id: 2, name: 'Bruno Teste' },
          { id: 3, name: 'Carla Ficticia' },
        ],
      });
    },
    methods: {
      open: function (preset) {
        if (!preset && params.get('preset') === 'loaded') preset = 'loaded';
        Object.assign(this, emptyState());
        if (preset === 'loaded') {
          this.nbs = '999999999';
          this.consumo = { id: 1, name: 'Sim' };
        } else if (preset && typeof preset === 'object') {
          Object.assign(this, preset);
        }
        this.ids = {
          descricao: String(++counter),
          nbs: String(++counter),
          consumo: String(++counter),
          governamental: String(++counter),
          nome: String(++counter),
          interno: String(++counter),
          distribuidora: String(++counter),
          tipoConta: String(++counter),
          debitoAuto: String(++counter),
          tipoPessoa: String(++counter),
          vencimento: String(++counter),
          competencia: String(++counter),
        };
        this.late = false;
        this.confirmOpen = false;
        this.mounted = true;
        this.active = true;
        clearTimeout(lateTimer);
        lateTimer = setTimeout(function () {
          vm.late = true;
        }, 800);
      },
      confirmBack: function () {
        this.confirmOpen = false;
      },
      confirmCancel: function () {
        window.__cancelled = true;
        this.confirmOpen = false;
        this.close();
      },
      close: function () {
        if (this.closeMode === 'class') {
          this.hideViaClass();
        } else {
          clearTimeout(lateTimer);
          this.mounted = false;
          this.active = false;
          this.late = false;
        }
      },
      hideViaClass: function () {
        this.active = false;
      },
      emit: function () {
        window.__emitted = true;
      },
    },
  });

  window.__emitted = false;
  window.__cancelled = false;
  window.__escapeCount = 0;

  // Imita o site real: com o modal aberto, Escape no document (keydown OU keyup) pede
  // confirmação "Deseja cancelar a emissão da nota?". Se um adaptador disparar Escape
  // borbulhante, o diálogo aparece e __escapeCount > 0 (os testes e2e detectam a regressão).
  function onEscape(ev) {
    if (ev.key !== 'Escape') return;
    window.__escapeCount++;
    if (vm.mounted && vm.active) vm.confirmOpen = true;
  }
  // Campo CPF com máscara e "busca automática" que só reage a digitação real (keydown):
  // depois de 11 dígitos digitados à mão, habilita "Nome do tomador" (como um cadastro que
  // consulta o documento). Escrita programática sem teclas não dispara a busca.
  window.__docKeys = 0;
  document.addEventListener('keydown', function (ev) {
    if (ev.target && ev.target.id === 'doc-cpf') window.__docKeys++;
  });
  document.addEventListener('input', function (ev) {
    var el = ev.target;
    if (!el || el.id !== 'doc-cpf') return;
    var d = el.value.replace(/\D/g, '').slice(0, 11);
    el.value = d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
    if (d.length === 11 && window.__docKeys > 0) {
      setTimeout(function () {
        var nome = document.getElementById('doc-nome');
        if (nome) nome.disabled = false;
      }, 150);
    }
  });
  document.addEventListener('keydown', onEscape);
  document.addEventListener('keyup', onEscape);
  window.__harness = {
    getState: function () {
      return {
        descricao: vm.descricao,
        nbs: vm.nbs,
        consumo: vm.consumo,
        governamental: vm.governamental,
        nome: vm.nome,
        interno: vm.interno,
        distribuidora: vm.distribuidora,
        tipoConta: vm.tipoConta,
        debitoAuto: vm.debitoAuto,
        tipoPessoa: vm.tipoPessoa,
        vencimento: vm.vencimento,
        competencia: vm.competencia,
      };
    },
    open: function (preset) {
      vm.open(preset);
    },
    close: function () {
      vm.close();
    },
    hideViaClass: function () {
      vm.hideViaClass();
    },
  };
})();
