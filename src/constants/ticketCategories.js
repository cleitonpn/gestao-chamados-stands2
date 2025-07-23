// Subcategorias de chamados por área
export const TICKET_CATEGORIES = {
  producao: [
    { value: 'manutencao_tapecaria', label: 'Manutenção Tapeçaria' },
    { value: 'manutencao_marcenaria', label: 'Manutenção Marcenaria' },
    { value: 'manutencao_eletrica', label: 'Manutenção Elétrica' }
  ],
  logistica: [
    { value: 'frete_imediato', label: 'Frete Imediato' },
    { value: 'agendar_frete', label: 'Agendar Frete' }
  ],
  operacional: [
    { value: 'documentacao', label: 'Documentação' },
    { value: 'informacoes', label: 'Informações' },
    { value: 'validacao', label: 'Validação' }
  ],
  locacao: [
    { value: 'troca_por_avaria', label: 'Troca por Avaria' },
    { value: 'troca', label: 'Troca' },
    { value: 'locacao_inicial', label: 'Locação Inicial' },
    { value: 'falta_de_mobiliario', label: 'Falta de Mobiliário' },
    { value: 'erro_de_modelo', label: 'Erro de Modelo' },
    { value: 'retirada_mobiliario_erro', label: 'Retirada de Mobiliário por Erro' },
    { value: 'retirada_mobiliario_pedido_cliente', label: 'Retirada de Mobiliário a Pedido do Cliente' }
  ],
  comunicacao_visual: [
    { value: 'troca_lona_cliente', label: 'Troca Lona Cliente' },
    { value: 'troca_adesivo_cliente', label: 'Troca Adesivo Cliente' },
    { value: 'troca_logo_cliente', label: 'Troca Logo Cliente' },
    { value: 'troca_lona_erro', label: 'Troca de Lona por Erro' },
    { value: 'refacao_adesivo_erro', label: 'Refação de Adesivo por Erro' },
    { value: 'troca_lona_avaria', label: 'Troca de Lona por Avaria' },
    { value: 'troca_adesivo_avaria', label: 'Troca de Adesivo por Avaria' },
    { value: 'troca_logo_erro', label: 'Troca de Logo por Erro' },
    { value: 'troca_logo_avaria', label: 'Troca de Logo por Avaria' },
    { value: 'instalacao_inicial', label: 'Instalação Inicial' }
  ],
  almoxarifado: [
    { value: 'pedido_material', label: 'Pedido de Material' },
    { value: 'pedido_mobiliario', label: 'Pedido de Mobiliário' },
    { value: 'pedido_maquinario', label: 'Pedido de Maquinário' }
  ],
  compras: [
    { value: 'material', label: 'Material' },
    { value: 'maquina', label: 'Máquina' },
    { value: 'pedido_cliente', label: 'Pedido do Cliente' },
    { value: 'item_cenografico', label: 'Item Cenográfico' }
  ],
  financeiro: [
    { value: 'pedido_caixinha', label: 'Pedido de Caixinha' },
    { value: 'pagamento_documentacao', label: 'Pagamento de Documentação' },
    { value: 'outros', label: 'Outros' }
  ],
  logotipia: [
    { value: 'criacao_logo', label: 'Criação de Logo' },
    { value: 'alteracao_logo', label: 'Alteração de Logo' },
    { value: 'aprovacao_logo', label: 'Aprovação de Logo' },
    { value: 'entrega_logo', label: 'Entrega de Logo' }
  ],
  gerencia: [
    { value: 'comercial', label: 'Comercial' },
    { value: 'operacional', label: 'Operacional' },
    { value: 'producao', label: 'Produção' }
  ],
  projetos: [
    { value: 'planejamento', label: 'Planejamento' },
    { value: 'cronograma', label: 'Cronograma' },
    { value: 'recursos', label: 'Recursos' },
    { value: 'documentacao_projeto', label: 'Documentação do Projeto' },
    { value: 'aprovacao', label: 'Aprovação' },
    { value: 'revisao', label: 'Revisão' }
  ],
  // NOVA ÁREA: Detalhamento técnico
  detalhamento_tecnico: [
    { value: 'detalhamento_inicial', label: 'Detalhamento Inicial' },
    { value: 'pedido_alteracao', label: 'Pedido de Alteração' },
    { value: 'informacao_tecnica', label: 'Informação Técnica' }
  ],
  // NOVA ÁREA: Sub-locação
  sub_locacao: [
    { value: 'pedido_inicial_locacao', label: 'Pedido Inicial de Locação' }
  ]
};

// Função para validar uma categoria individual
const validateCategory = (category, areaName) => {
  if (!category) {
    console.error(`❌ Categoria nula/indefinida encontrada na área ${areaName}`);
    return false;
  }
  
  if (!category.value || typeof category.value !== 'string' || category.value.trim() === '') {
    console.error(`❌ Categoria com valor inválido na área ${areaName}:`, category);
    return false;
  }
  
  if (!category.label || typeof category.label !== 'string' || category.label.trim() === '') {
    console.error(`❌ Categoria com label inválido na área ${areaName}:`, category);
    return false;
  }
  
  return true;
};

// Função para obter categorias por área com validação robusta
export const getCategoriesByArea = (area) => {
  console.log('🔍 getCategoriesByArea chamada com área:', area);
  
  // Verificar se a área existe
  if (!area || typeof area !== 'string') {
    console.error('❌ Área inválida fornecida:', area);
    return [];
  }
  
  // Verificar se a área existe no mapeamento
  if (!TICKET_CATEGORIES.hasOwnProperty(area)) {
    console.error('❌ Área não encontrada no mapeamento:', area);
    console.log('🔍 Áreas disponíveis:', Object.keys(TICKET_CATEGORIES));
    return [];
  }
  
  const categories = TICKET_CATEGORIES[area];
  console.log('🔍 Categorias brutas encontradas para', area, ':', categories);
  
  // Verificar se categories é um array
  if (!Array.isArray(categories)) {
    console.error('❌ Categorias não é um array para área', area, ':', categories);
    return [];
  }
  
  // Filtrar e validar categorias
  const validCategories = categories.filter(category => validateCategory(category, area));
  
  console.log('✅ Categorias válidas após validação para', area, ':', validCategories);
  
  // Verificar se há categorias válidas
  if (validCategories.length === 0) {
    console.warn(`⚠️ Nenhuma categoria válida encontrada para área ${area}`);
  }
  
  return validCategories;
};

// Função para obter label da categoria
export const getCategoryLabel = (area, categoryValue) => {
  const categories = getCategoriesByArea(area);
  const category = categories.find(cat => cat.value === categoryValue);
  return category ? category.label : categoryValue;
};

// Função para verificar se uma categoria existe em uma área
export const categoryExistsInArea = (area, categoryValue) => {
  const categories = getCategoriesByArea(area);
  return categories.some(cat => cat.value === categoryValue);
};

// Função para obter todas as áreas disponíveis
export const getAvailableAreas = () => {
  return Object.keys(TICKET_CATEGORIES);
};

// Função de debug para verificar integridade dos dados
export const debugCategoriesIntegrity = () => {
  console.log('🔍 Verificando integridade das categorias...');
  
  const areas = Object.keys(TICKET_CATEGORIES);
  let totalCategories = 0;
  let validCategories = 0;
  
  areas.forEach(area => {
    const categories = TICKET_CATEGORIES[area];
    console.log(`\n📋 Área: ${area}`);
    console.log(`   Total de categorias: ${categories.length}`);
    
    categories.forEach((category, index) => {
      totalCategories++;
      const isValid = validateCategory(category, area);
      if (isValid) {
        validCategories++;
        console.log(`   ✅ [${index}] ${category.value} -> ${category.label}`);
      } else {
        console.log(`   ❌ [${index}] CATEGORIA INVÁLIDA:`, category);
      }
    });
  });
  
  console.log(`\n📊 Resumo da integridade:`);
  console.log(`   Total de categorias: ${totalCategories}`);
  console.log(`   Categorias válidas: ${validCategories}`);
  console.log(`   Categorias inválidas: ${totalCategories - validCategories}`);
  console.log(`   Taxa de integridade: ${((validCategories / totalCategories) * 100).toFixed(2)}%`);
  
  return {
    total: totalCategories,
    valid: validCategories,
    invalid: totalCategories - validCategories,
    integrityRate: (validCategories / totalCategories) * 100
  };
};
