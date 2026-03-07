const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
  Events,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const fs = require('fs');
require('dotenv').config();

// Utils e Services
const Database = require('./utils/database');
const Validator = require('./utils/validator');
const Security = require('./utils/security');
const Cache = require('./utils/cacheManager');
const Scheduler = require('./services/scheduler');
const AlbionAPI = require('./services/albionApi');

// Handlers
const RegistrationModal = require('./handlers/registrationModal');
const RegistrationActions = require('./handlers/registrationActions');
const ConfigActions = require('./handlers/configActions');
const GuildMemberRemoveHandler = require('./handlers/guildMemberRemove');
const EventPanel = require('./handlers/eventPanel');
const EventHandler = require('./handlers/eventHandler');
const LootSplitHandler = require('./handlers/lootSplitHandler');
const FinanceHandler = require('./handlers/financeHandler');
const ConsultarSaldoHandler = require('./handlers/consultarSaldoHandler');
const BalancePanelHandler = require('./handlers/balancePanelHandler');
const BauSaleHandler = require('./handlers/bauSaleHandler');
const EventStatsHandler = require('./handlers/eventStatsHandler');
const MemberListPanel = require('./handlers/memberListPanel');
const XpEventHandler = require('./handlers/xpEventHandler');
const OrbHandler = require('./handlers/orbHandler');
const PerfilHandler = require('./handlers/perfilHandler');
const XpHandler = require('./handlers/xpHandler');
const TemplateHandler = require('./handlers/templateHandler');
const RecurrenceHandler = require('./handlers/recurrenceHandler');
const VotingHandler = require('./handlers/votingHandler');
const DailyRewardsHandler = require('./handlers/dailyRewardsHandler');
const AuditHandler = require('./handlers/auditHandler');

// Criar cliente
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildPresences
  ],
  partials: ['CHANNEL']
});

// Coleção de comandos
client.commands = new Collection();

// Importar Comandos
const instalarCommand = require('./commands/instalar');
const desistalarCommand = require('./commands/desistalar');
const atualizarCommand = require('./commands/atualizar');
const templateCommand = require('./commands/template');
const voteCommand = require('./commands/vote');
const auditCommand = require('./commands/audit');
const dailyCommand = require('./commands/daily');

// Registrar comandos
const commands = [
  instalarCommand,
  desistalarCommand,
  atualizarCommand,
  templateCommand,
  voteCommand,
  auditCommand,
  dailyCommand
];

commands.forEach(cmd => client.commands.set(cmd.data.name, cmd));

// Inicializar variáveis globais
global.registrosPendentes = new Map();
global.registroTemp = new Map();
global.guildConfig = new Map();
global.blacklist = new Map();
global.historicoRegistros = new Map();
global.activeEvents = new Map();
global.finishedEvents = new Map();
global.simulations = new Map();
global.pendingWithdrawals = new Map();
global.pendingLoans = new Map();
global.pendingTransfers = new Map();
global.pendingBauSales = new Map();
global.activeXpEvents = new Map();
global.pendingOrbDeposits = new Map();
global.client = client;
global.recurrenceHandler = null; // Será inicializado depois

// Rate limiting maps
const rateLimits = new Map();

// Evento Ready
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot logado como ${client.user.tag}`);
  console.log(`🤖 ID do Bot: ${client.user.id}`);
  console.log(`📅 Data de início: ${new Date().toLocaleString()}`);

  // Inicializar sistemas
  Database.initialize();
  RegistrationActions.initialize();
  EventHandler.initialize();
  global.recurrenceHandler = new RecurrenceHandler(); // Carrega recorrências

  console.log('📝 Sistemas inicializados');

  // Registrar Slash Commands
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    console.log('🔄 Registrando comandos slash...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands.map(c => c.data.toJSON()) }
    );
    console.log(`✅ ${commands.length} comandos registrados`);
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:', error);
  }

  // Agenda jobs periódicos
  Scheduler.scheduleInterval('cleanup', 24 * 60 * 60 * 1000, () => {
    Database.cleanup();
    Cache.cleanup();
  });
});

// Handler Principal de Interações
client.on(Events.InteractionCreate, async interaction => {
  try {
    // Rate limit global por usuário
    const rateCheck = Validator.checkRateLimit(rateLimits, interaction.user.id, 1000);
    if (!rateCheck.allowed) {
      return interaction.reply({ 
        content: `⏳ Muitas requisições. Aguarde ${rateCheck.remaining}s.`, 
        ephemeral: true 
      });
    }

    // ==================== COMANDOS SLASH ====================
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      // Validações de permissão específicas por comando
      if (['instalar', 'desistalar'].includes(command.data.name)) {
        const isADM = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isADM) {
          return interaction.reply({ content: '❌ Apenas ADMs!', ephemeral: true });
        }
      }

      try {
        await command.execute(interaction, client);
      } catch (error) {
        console.error(`[Command] Error in ${interaction.commandName}:`, error);
        await handleError(interaction, error);
      }
      return;
    }

    // ==================== BOTÕES ====================
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // Rate limit mais estrito para botões
      const btnRateCheck = Validator.checkRateLimit(rateLimits, `${interaction.user.id}_${customId}`, 500);
      if (!btnRateCheck.allowed) return;

      // Router de botões
      await handleButton(interaction, customId);
      return;
    }

    // ==================== SELECT MENUS ====================
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
      return;
    }

    // ==================== MODALS ====================
    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
      return;
    }

  } catch (error) {
    console.error('[Interaction] Global error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: '❌ Erro interno. Equipe notificada.', 
        ephemeral: true 
      });
    }
  }
});

/**
 * Router de Botões
 */
async function handleButton(interaction, customId) {
  try {
    // Sistema de Registro
    if (customId === 'btn_abrir_registro') {
      const modal = RegistrationModal.createRegistrationModal();
      await interaction.showModal(modal);
      return;
    }

    if (customId === 'btn_tentar_novamente_registro') {
      const modal = RegistrationModal.createRegistrationModal();
      await interaction.showModal(modal);
      return;
    }

    if (customId.startsWith('aprovar_membro_')) {
      const regId = customId.replace('aprovar_membro_', '');
      await Security.withLock(`reg_${regId}`, async () => {
        await RegistrationActions.approveAsMember(interaction, regId);
      });
      return;
    }

    if (customId.startsWith('aprovar_alianca_')) {
      const regId = customId.replace('aprovar_alianca_', '');
      await Security.withLock(`reg_${regId}`, async () => {
        await RegistrationActions.approveAsAlianca(interaction, regId);
      });
      return;
    }

    if (customId.startsWith('aprovar_convidado_')) {
      const regId = customId.replace('aprovar_convidado_', '');
      await Security.withLock(`reg_${regId}`, async () => {
        await RegistrationActions.approveAsConvidado(interaction, regId);
      });
      return;
    }

    if (customId.startsWith('recusar_registro_')) {
      const regId = customId.replace('recusar_registro_', '');
      await RegistrationActions.handleRejectRegistration(interaction, regId);
      return;
    }

    if (customId.startsWith('blacklist_add_')) {
      const regId = customId.replace('blacklist_add_', '');
      await Security.withLock(`blacklist_${regId}`, async () => {
        await RegistrationActions.handleBlacklistAdd(interaction, regId);
      });
      return;
    }

    // Sistema de Eventos
    if (customId === 'btn_criar_evento') {
      // Verifica se quer usar template ou criar do zero
      await TemplateHandler.showTemplateSelector(interaction, 'use');
      return;
    }

    if (customId.startsWith('use_')) {
      const templateId = customId.replace('use_', '');
      await TemplateHandler.loadTemplateForEvent(interaction, templateId);
      return;
    }

    if (customId.startsWith('evt_participar_')) {
      const eventId = customId.replace('evt_participar_', '');
      await Security.withLock(`event_${eventId}`, async () => {
        await EventHandler.handleParticipar(interaction, eventId);
      });
      return;
    }

    if (customId.startsWith('evt_iniciar_')) {
      const eventId = customId.replace('evt_iniciar_', '');
      await EventHandler.handleIniciar(interaction, eventId);
      return;
    }

    if (customId.startsWith('evt_pausar_global_')) {
      const eventId = customId.replace('evt_pausar_global_', '');
      await EventHandler.handlePausarGlobal(interaction, eventId, true);
      return;
    }

    if (customId.startsWith('evt_retomar_global_')) {
      const eventId = customId.replace('evt_retomar_global_', '');
      await EventHandler.handlePausarGlobal(interaction, eventId, false);
      return;
    }

    if (customId.startsWith('evt_pausar_')) {
      const eventId = customId.replace('evt_pausar_', '');
      await EventHandler.handlePausar(interaction, eventId);
      return;
    }

    if (customId.startsWith('evt_trancar_')) {
      const eventId = customId.replace('evt_trancar_', '');
      await EventHandler.handleTrancar(interaction, eventId);
      return;
    }

    if (customId.startsWith('evt_cancelar_')) {
      const eventId = customId.replace('evt_cancelar_', '');
      await EventHandler.handleCancelar(interaction, eventId);
      return;
    }

    if (customId.startsWith('evt_finalizar_')) {
      const eventId = customId.replace('evt_finalizar_', '');
      await EventHandler.handleFinalizar(interaction, eventId);
      return;
    }

    // Sistema de LootSplit
    if (customId.startsWith('loot_simular_')) {
      const eventId = customId.replace('loot_simular_', '');
      const modal = LootSplitHandler.createSimulationModal(eventId);
      await interaction.showModal(modal);
      return;
    }

    if (customId.startsWith('loot_enviar_')) {
      const simulationId = customId.replace('loot_enviar_', '');
      await LootSplitHandler.handleEnviar(interaction, simulationId);
      return;
    }

    if (customId.startsWith('loot_recalcular_')) {
      const simulationId = customId.replace('loot_recalcular_', '');
      await LootSplitHandler.handleRecalcular(interaction, simulationId);
      return;
    }

    if (customId.startsWith('fin_aprovar_')) {
      const simulationId = customId.replace('fin_aprovar_', '');
      await Security.withLock(`sim_${simulationId}`, async () => {
        await LootSplitHandler.handleAprovacaoFinanceira(interaction, simulationId, true);
      });
      return;
    }

    if (customId.startsWith('fin_recusar_')) {
      const simulationId = customId.replace('fin_recusar_', '');
      await LootSplitHandler.handleAprovacaoFinanceira(interaction, simulationId, false);
      return;
    }

    if (customId.startsWith('loot_arquivar_')) {
      const simulationId = customId.replace('loot_arquivar_', '');
      await LootSplitHandler.handleArquivar(interaction, null, simulationId);
      return;
    }

    // Lista de Membros
    if (customId === 'btn_atualizar_lista_membros') {
      await interaction.deferUpdate();
      await MemberListPanel.updatePanel(interaction.message, interaction.guild);
      return;
    }

    // Configurações
    if (customId === 'config_taxa_guilda') {
      await ConfigActions.handleTaxaGuilda(interaction);
      return;
    }

    if (customId === 'config_registrar_guilda') {
      await ConfigActions.handleRegistrarGuilda(interaction);
      return;
    }

    if (customId === 'config_xp') {
      await ConfigActions.handleXP(interaction);
      return;
    }

    if (customId === 'config_taxa_bau') {
      await ConfigActions.handleTaxaBau(interaction);
      return;
    }

    if (customId === 'config_taxa_emprestimo') {
      await ConfigActions.handleTaxaEmprestimo(interaction);
      return;
    }

    // Sistema Financeiro
    if (customId === 'btn_consultar_saldo') {
      await ConsultarSaldoHandler.handleConsultarSaldo(interaction);
      return;
    }

    if (customId === 'btn_sacar_saldo') {
      await ConsultarSaldoHandler.handleSacarSaldo(interaction);
      return;
    }

    if (customId === 'btn_solicitar_emprestimo') {
      await ConsultarSaldoHandler.handleSolicitarEmprestimo(interaction);
      return;
    }

    if (customId === 'btn_transferir_saldo') {
      await ConsultarSaldoHandler.handleTransferirSaldo(interaction);
      return;
    }

    if (customId === 'btn_atualizar_saldo_guilda') {
      await BalancePanelHandler.handleManualUpdate(interaction);
      return;
    }

    if (customId.startsWith('fin_confirmar_saque_')) {
      const withdrawalId = customId.replace('fin_confirmar_saque_', '');
      await Security.withLock(`wd_${withdrawalId}`, async () => {
        await FinanceHandler.handleConfirmWithdrawal(interaction, withdrawalId);
      });
      return;
    }

    if (customId.startsWith('fin_recusar_saque_')) {
      const withdrawalId = customId.replace('fin_recusar_saque_', '');
      await FinanceHandler.handleRejectWithdrawal(interaction, withdrawalId);
      return;
    }

    if (customId.startsWith('fin_confirmar_emprestimo_')) {
      const loanId = customId.replace('fin_confirmar_emprestimo_', '');
      await FinanceHandler.handleConfirmLoan(interaction, loanId);
      return;
    }

    if (customId.startsWith('fin_recusar_emprestimo_')) {
      const loanId = customId.replace('fin_recusar_emprestimo_', '');
      await FinanceHandler.handleRejectLoan(interaction, loanId);
      return;
    }

    if (customId.startsWith('transf_aceitar_')) {
      const transferId = customId.replace('transf_aceitar_', '');
      await FinanceHandler.handleAcceptTransfer(interaction, transferId);
      return;
    }

    if (customId.startsWith('transf_recusar_')) {
      const transferId = customId.replace('transf_recusar_', '');
      await FinanceHandler.handleRejectTransfer(interaction, transferId);
      return;
    }

    // Venda de Baú
    if (customId === 'btn_vender_bau') {
      await BauSaleHandler.showLocationSelect(interaction);
      return;
    }

    if (customId.startsWith('bau_comprar_')) {
      const saleId = customId.replace('bau_comprar_', '');
      await BauSaleHandler.handleComprar(interaction, saleId);
      return;
    }

    if (customId.startsWith('bau_recusar_')) {
      const saleId = customId.replace('bau_recusar_', '');
      await BauSaleHandler.handleRecusar(interaction, saleId);
      return;
    }

    // Estatísticas
    if (customId === 'btn_atualizar_stats_eventos') {
      await EventStatsHandler.handleAtualizar(interaction);
      return;
    }

    // Sistema de XP
    if (customId === 'btn_criar_xp_event') {
      const modal = await XpEventHandler.createXpEventModal();
      await interaction.showModal(modal);
      return;
    }

    if (customId === 'btn_depositar_orb') {
      await OrbHandler.showUserSelect(interaction);
      return;
    }

    if (customId === 'btn_depositar_xp_manual') {
      await PerfilHandler.showDepositXpModal(interaction);
      return;
    }

    if (customId === 'btn_ver_perfil') {
      await PerfilHandler.showProfile(interaction);
      return;
    }

    if (customId.startsWith('xp_event_finalizar_')) {
      const eventId = customId.replace('xp_event_finalizar_', '');
      await XpEventHandler.finalizarXpEvent(interaction, eventId);
      return;
    }

    if (customId.startsWith('xp_event_cancelar_')) {
      const eventId = customId.replace('xp_event_cancelar_', '');
      await XpEventHandler.cancelarXpEvent(interaction, eventId);
      return;
    }

    if (customId.startsWith('orb_approve_')) {
      const depositId = customId.replace('orb_approve_', '');
      await OrbHandler.approveOrb(interaction, depositId);
      return;
    }

    if (customId.startsWith('orb_reject_')) {
      const depositId = customId.replace('orb_reject_', '');
      await OrbHandler.rejectOrb(interaction, depositId);
      return;
    }

    // Sistema de Votação
    if (customId.startsWith('vote_cast_')) {
      const parts = customId.replace('vote_cast_', '').split('_');
      const voteId = parts.slice(0, -1).join('_');
      const optionIdx = parts[parts.length - 1];
      await VotingHandler.processVote(interaction, voteId, optionIdx);
      return;
    }

    if (customId.startsWith('vote_end_')) {
      const voteId = customId.replace('vote_end_', '');
      await VotingHandler.processEndVote(interaction, voteId);
      return;
    }

    // Sistema Daily Rewards
    if (customId === 'btn_daily_checkin') {
      await DailyRewardsHandler.processCheckin(interaction);
      return;
    }

    if (customId === 'btn_daily_ranking') {
      await DailyRewardsHandler.showRanking(interaction);
      return;
    }

    if (customId === 'btn_daily_info') {
      await DailyRewardsHandler.showInfo(interaction);
      return;
    }

    // Fallback
    await interaction.reply({ content: '⚠️ Ação não reconhecida.', ephemeral: true });

  } catch (error) {
    console.error('[Button] Error:', error);
    if (!interaction.replied) {
      await interaction.reply({ content: '❌ Erro ao processar ação.', ephemeral: true });
    }
  }
}

/**
 * Router de Select Menus
 */
async function handleSelectMenu(interaction) {
  try {
    if (interaction.customId === 'select_server_registro') {
      await RegistrationModal.processServerSelect(interaction);
      return;
    }

    if (interaction.customId === 'select_platform_registro') {
      await RegistrationModal.processPlatformSelect(interaction, client);
      return;
    }

    if (interaction.customId === 'select_taxa_guilda') {
      await ConfigActions.handleTaxaSelect(interaction);
      return;
    }

    if (interaction.customId === 'select_local_bau') {
      const modal = BauSaleHandler.createBauSaleModal();
      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === 'select_periodo_eventos') {
      await EventStatsHandler.handlePeriodSelect(interaction);
      return;
    }

    if (interaction.customId === 'select_filtro_cargo') {
      await MemberListPanel.handleFilterSelect(interaction);
      return;
    }

    if (interaction.customId === 'select_template_action') {
      const [action, templateId] = interaction.values[0].split('_');
      if (action === 'use') {
        await TemplateHandler.loadTemplateForEvent(interaction, templateId);
      } else if (action === 'edit') {
        // Implementar edição
        await interaction.reply({ content: '🔧 Edição de template em desenvolvimento.', ephemeral: true });
      }
      return;
    }

    if (interaction.customId === 'select_orb_users') {
      const users = interaction.values;
      await OrbHandler.showOrbTypeSelect(interaction);
      return;
    }

    await interaction.reply({ content: '⚠️ Menu não reconhecido.', ephemeral: true });

  } catch (error) {
    console.error('[SelectMenu] Error:', error);
    await interaction.reply({ content: '❌ Erro ao processar seleção.', ephemeral: true });
  }
}

/**
 * Router de Modals
 */
async function handleModal(interaction) {
  try {
    const customId = interaction.customId;

    // Sistema de Registro
    if (customId === 'modal_registro') {
      const nick = interaction.fields.getTextInputValue('reg_nick').trim();
      const erros = await RegistrationActions.checkExistingRegistration(
        interaction.guild,
        interaction.user.id,
        nick
      );

      if (erros.length > 0) {
        await interaction.reply({
          content: `❌ **Não foi possível iniciar o registro:**\n\n${erros.join('\n')}`,
          ephemeral: true
        });
        return;
      }

      await RegistrationModal.processRegistration(interaction, client);
      return;
    }

    if (customId.startsWith('modal_recusar_registro_')) {
      const regId = interaction.customId.replace('modal_recusar_registro_', '');
      await RegistrationActions.processRejectionWithReason(interaction, regId);
      return;
    }

    if (customId.startsWith('modal_blacklist_')) {
      const regId = interaction.customId.replace('modal_blacklist_', '');
      await RegistrationActions.processBlacklistAdd(interaction, regId);
      return;
    }

    // Sistema de Eventos
    if (customId === 'modal_criar_evento' || customId.startsWith('modal_criar_evento_template_')) {
      await EventHandler.createEvent(interaction);
      return;
    }

    // Sistema de Templates
    if (customId === 'modal_create_template') {
      await TemplateHandler.processCreateTemplate(interaction);
      return;
    }

    if (customId.startsWith('modal_recurrence_')) {
      const templateId = customId.replace('modal_recurrence_', '');
      await RecurrenceHandler.processRecurrenceConfig(interaction, templateId);
      return;
    }

    // Sistema de LootSplit
    if (customId.startsWith('modal_simular_evento_')) {
      const eventId = interaction.customId.replace('modal_simular_evento_', '');
      await LootSplitHandler.processSimulation(interaction, eventId);
      return;
    }

    // Configurações
    if (customId === 'modal_registrar_guilda') {
      await ConfigActions.processGuildRegistration(interaction);
      return;
    }

    if (customId === 'modal_taxas_bau') {
      await ConfigActions.processTaxaBau(interaction);
      return;
    }

    if (customId === 'modal_taxa_emprestimo') {
      await ConfigActions.processTaxaEmprestimo(interaction);
      return;
    }

    // Modais Financeiros
    if (customId === 'modal_sacar_saldo') {
      await FinanceHandler.processWithdrawRequest(interaction);
      return;
    }

    if (customId === 'modal_solicitar_emprestimo') {
      await FinanceHandler.processLoanRequest(interaction);
      return;
    }

    if (customId === 'modal_transferir_saldo') {
      await FinanceHandler.processTransferRequest(interaction);
      return;
    }

    if (customId.startsWith('modal_motivo_recusa_saque_')) {
      const withdrawalId = interaction.customId.replace('modal_motivo_recusa_saque_', '');
      await FinanceHandler.processWithdrawalRejection(interaction, withdrawalId);
      return;
    }

    // Venda de Baú
    if (customId === 'modal_vender_bau') {
      await BauSaleHandler.processSaleRequest(interaction);
      return;
    }

    if (customId.startsWith('modal_motivo_recusa_bau_')) {
      const saleId = interaction.customId.replace('modal_motivo_recusa_bau_', '');
      await BauSaleHandler.processRejection(interaction, saleId);
      return;
    }

    // Sistema de XP
    if (customId === 'modal_criar_xp_event') {
      await XpEventHandler.processCreateXpEvent(interaction);
      return;
    }

    if (customId.startsWith('modal_depositar_orb_')) {
      const parts = customId.replace('modal_depositar_orb_', '').split('_');
      const orbType = parts[0];
      const users = parts.slice(1).join('_').split(',');
      await OrbHandler.processOrbDeposit(interaction, orbType, users);
      return;
    }

    if (customId.startsWith('modal_depositar_xp_')) {
      const targetUserId = customId.replace('modal_depositar_xp_', '');
      await PerfilHandler.processManualXpDeposit(interaction, targetUserId);
      return;
    }

    // Sistema de Votação
    if (customId === 'modal_create_vote') {
      await VotingHandler.processCreateVote(interaction);
      return;
    }

    await interaction.reply({ content: '⚠️ Modal não reconhecido.', ephemeral: true });

  } catch (error) {
    console.error('[Modal] Error:', error);
    await handleError(interaction, error);
  }
}

/**
 * Handler de Erros Padronizado
 */
async function handleError(interaction, error) {
  console.error('[Error]', error);

  const message = '❌ Ocorreu um erro ao processar sua solicitação.';

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content: message, ephemeral: true });
  } else {
    await interaction.reply({ content: message, ephemeral: true });
  }
}

// Evento: Membro sai do servidor
client.on(Events.GuildMemberRemove, async (member) => {
  await GuildMemberRemoveHandler.handle(member);
});

// Handlers de Erros Globais
process.on('unhandledRejection', error => {
  console.error('❌ Unhandled rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('❌ Uncaught exception:', error);
  // Salva dados críticos antes de morrer
  Database.close();
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n💾 Salvando dados...');
  Database.close();
  process.exit();
});

process.on('SIGTERM', async () => {
  console.log('\n💾 Encerrando graciosamente...');
  Database.close();
  process.exit();
});

// Login
client.login(process.env.TOKEN).then(() => {
  console.log('🔐 Login realizado');
}).catch(error => {
  console.error('❌ Erro ao fazer login:', error);
});