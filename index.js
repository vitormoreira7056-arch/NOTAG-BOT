const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
  Events,
  PermissionFlagsBits
} = require('discord.js');
const fs = require('fs');
require('dotenv').config();

// Importar Handlers
const RegistrationModal = require('./handlers/registrationModal');
const RegistrationActions = require('./handlers/registrationActions');
const ConfigActions = require('./handlers/configActions');
const GuildMemberRemoveHandler = require('./handlers/guildMemberRemove');
const EventPanel = require('./handlers/eventPanel');
const EventHandler = require('./handlers/eventHandler');
const LootSplitHandler = require('./handlers/lootSplitHandler');
const Database = require('./utils/database');
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

// Importar Comandos de Admin
const limparEventosCommand = require('./commands/limpar-eventos');
const limparXpCommand = require('./commands/limpar-xp');
const limparSaldoCommand = require('./commands/limpar-saldo');

// Registrar comandos na coleção (adicione junto aos outros)
client.commands.set(limparEventosCommand.data.name, limparEventosCommand);
client.commands.set(limparXpCommand.data.name, limparXpCommand);
client.commands.set(limparSaldoCommand.data.name, limparSaldoCommand);

// Registrar comandos na coleção
client.commands.set(instalarCommand.data.name, instalarCommand);
client.commands.set(desistalarCommand.data.name, desistalarCommand);
client.commands.set(atualizarCommand.data.name, atualizarCommand);

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

// Carregar dados persistidos
try {
  if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data', { recursive: true });
  }

  if (fs.existsSync('./data/blacklist.json')) {
    const blacklistData = JSON.parse(fs.readFileSync('./data/blacklist.json', 'utf8'));
    global.blacklist = new Map(blacklistData);
    console.log(`📋 Blacklist carregada: ${global.blacklist.size} jogadores banidos`);
  }

  if (fs.existsSync('./data/historico.json')) {
    const historicoData = JSON.parse(fs.readFileSync('./data/historico.json', 'utf8'));
    global.historicoRegistros = new Map(historicoData);
    console.log(`📜 Histórico carregado: ${global.historicoRegistros.size} usuários com histórico`);
  }
} catch (error) {
  console.error('❌ Erro ao carregar dados persistidos:', error);
}

// Evento Ready
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot logado como ${client.user.tag}`);
  console.log(`🤖 ID do Bot: ${client.user.id}`);
  console.log(`📅 Data de início: ${new Date().toLocaleString()}`);

  // Inicializar sistemas
  Database.initialize();
  RegistrationActions.initialize();
  EventHandler.initialize();
  console.log('📝 Sistemas inicializados: Database + Registro + Eventos');

  // Registrar Slash Commands
  const commands = [
    instalarCommand.data.toJSON(),
    desistalarCommand.data.toJSON(),
    atualizarCommand.data.toJSON()
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    console.log('🔄 Iniciando registro dos comandos slash...');

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log('✅ Comandos slash registrados com sucesso!');
    console.log(`📋 Total de comandos: ${commands.length}`);
  } catch (error) {
    console.error('❌ Erro ao registrar comandos slash:', error);
  }
});

// Handler Principal de Interações
client.on(Events.InteractionCreate, async interaction => {
  try {
    // ==================== COMANDOS SLASH ====================
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        console.error(`❌ Comando não encontrado: ${interaction.commandName}`);
        return;
      }

      if (command.data.name === 'instalar' || command.data.name === 'desistalar') {
        const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM') ||
          interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isADM) {
          return interaction.reply({
            content: '❌ Apenas ADMs podem usar este comando!',
            ephemeral: true
          });
        }
      }

      try {
        await command.execute(interaction, client);
      } catch (error) {
        console.error(`❌ Erro ao executar comando ${interaction.commandName}:`, error);

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: '❌ Ocorreu um erro ao executar este comando!',
            ephemeral: true
          });
        } else {
          await interaction.reply({
            content: '❌ Ocorreu um erro ao executar este comando!',
            ephemeral: true
          });
        }
      }
      return;
    }

    // ==================== BOTÕES ====================
    if (interaction.isButton()) {
      const customId = interaction.customId;

      // SISTEMA DE REGISTRO
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
        await RegistrationActions.approveAsMember(interaction, regId);
        return;
      }

      if (customId.startsWith('aprovar_alianca_')) {
        const regId = customId.replace('aprovar_alianca_', '');
        await RegistrationActions.approveAsAlianca(interaction, regId);
        return;
      }

      if (customId.startsWith('aprovar_convidado_')) {
        const regId = customId.replace('aprovar_convidado_', '');
        await RegistrationActions.approveAsConvidado(interaction, regId);
        return;
      }

      if (customId.startsWith('recusar_registro_')) {
        const regId = customId.replace('recusar_registro_', '');
        await RegistrationActions.handleRejectRegistration(interaction, regId);
        return;
      }

      if (customId.startsWith('blacklist_add_')) {
        const regId = customId.replace('blacklist_add_', '');
        await RegistrationActions.handleBlacklistAdd(interaction, regId);
        return;
      }

      // SISTEMA DE EVENTOS
      if (customId === 'btn_criar_evento') {
        const modal = EventPanel.createEventModal();
        await interaction.showModal(modal);
        return;
      }

      if (customId === 'btn_raid_avalon' || customId === 'btn_gank' || customId === 'btn_cta') {
        await interaction.reply({
          content: '🔒 Este recurso estará disponível em breve!',
          ephemeral: true
        });
        return;
      }

      if (customId.startsWith('evt_participar_')) {
        const eventId = customId.replace('evt_participar_', '');
        await EventHandler.handleParticipar(interaction, eventId);
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

      // SISTEMA DE LOOTSPLIT
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

      if (customId.startsWith('loot_atualizar_part_')) {
        await interaction.reply({
          content: '⚙️ Use o comando `/atualizar [membro] [porcentagem]` para ajustar participação.',
          ephemeral: true
        });
        return;
      }

      if (customId.startsWith('fin_aprovar_')) {
        const simulationId = customId.replace('fin_aprovar_', '');
        await LootSplitHandler.handleAprovacaoFinanceira(interaction, simulationId, true);
        return;
      }

      if (customId.startsWith('fin_recusar_')) {
        const simulationId = customId.replace('fin_recusar_', '');
        await LootSplitHandler.handleAprovacaoFinanceira(interaction, simulationId, false);
        return;
      }

      if (customId.startsWith('loot_arquivar_')) {
        const simulationId = customId.replace('loot_arquivar_', '');
        const simulation = global.simulations?.get(simulationId);

        if (simulation) {
          await LootSplitHandler.handleArquivar(interaction, simulation.eventId, simulationId);
        } else {
          await interaction.reply({
            content: '❌ Simulação não encontrada!',
            ephemeral: true
          });
        }
        return;
      }

      // LISTA DE MEMBROS
      if (customId === 'btn_atualizar_lista_membros') {
        await interaction.deferUpdate();
        await MemberListPanel.updatePanel(interaction.message, interaction.guild);
        return;
      }

      // CONFIGURAÇÕES
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

      if (customId === 'config_atualizar_bot') {
        await ConfigActions.handleAtualizarBot(interaction);
        return;
      }

      // Sistema Financeiro - Consultar Saldo
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

      // Painel de Saldo da Guilda
      if (customId === 'btn_atualizar_saldo_guilda') {
        await BalancePanelHandler.handleManualUpdate(interaction);
        return;
      }

      // Confirmação de Saque
      if (customId.startsWith('fin_confirmar_saque_')) {
        const withdrawalId = customId.replace('fin_confirmar_saque_', '');
        await FinanceHandler.handleConfirmWithdrawal(interaction, withdrawalId);
        return;
      }

      if (customId.startsWith('fin_recusar_saque_')) {
        const withdrawalId = customId.replace('fin_recusar_saque_', '');
        await FinanceHandler.handleRejectWithdrawal(interaction, withdrawalId);
        return;
      }

      // Confirmação de Empréstimo
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

      // Aceitar/Recusar Transferência
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

      // Estatísticas de Eventos
      if (customId === 'btn_atualizar_stats_eventos') {
        await EventStatsHandler.handleAtualizar(interaction);
        return;
      }

      // SISTEMA DE XP
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

      if (customId === 'btn_atualizar_ranking_xp') {
        // Atualizar ranking XP
        await interaction.deferUpdate();
        const embed = new EmbedBuilder()
          .setTitle('📊 RANKING DE XP')
          .setDescription('Ranking atualizado!')
          .setColor(0x3498DB)
          .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
        return;
      }
    }

    // ==================== SELECT MENUS ====================
    if (interaction.isStringSelectMenu()) {
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

      // Seleção de local do baú
      if (interaction.customId === 'select_local_bau') {
        const modal = BauSaleHandler.createBauSaleModal();
        await interaction.showModal(modal);
        return;
      }

      // Seleção de período de eventos
      if (interaction.customId === 'select_periodo_eventos') {
        await EventStatsHandler.handlePeriodSelect(interaction);
        return;
      }

      // Filtro de cargo na lista de membros
      if (interaction.customId === 'select_filtro_cargo') {
        await MemberListPanel.handleFilterSelect(interaction);
        return;
      }

      // Sistema de XP - seleção de tipo de orb
      if (interaction.customId === 'select_orb_type') {
        const orbType = interaction.values[0];
        // Armazenar temporariamente e mostrar modal
        // Implementação simplificada - na prática precisaria de estado
        await OrbHandler.showOrbTypeSelect(interaction);
        return;
      }

      if (interaction.customId === 'select_orb_users') {
        const users = interaction.values;
        // Guardar usuários e mostrar seleção de tipo
        await OrbHandler.showOrbTypeSelect(interaction);
        return;
      }
    }

    // User Select Menu
    if (interaction.isUserSelectMenu()) {
      if (interaction.customId === 'select_orb_users') {
        const users = interaction.values;
        await OrbHandler.showOrbTypeSelect(interaction);
        return;
      }

      if (interaction.customId === 'select_xp_target_user') {
        const targetUserId = interaction.values[0];
        await PerfilHandler.createManualXpModal(interaction, targetUserId);
        return;
      }
    }

    // ==================== MODALS ====================
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;

      // SISTEMA DE REGISTRO
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

      // SISTEMA DE EVENTOS
      if (customId === 'modal_criar_evento') {
        await EventHandler.createEvent(interaction);
        return;
      }

      // SISTEMA DE LOOTSPLIT
      if (customId.startsWith('modal_simular_evento_')) {
        const eventId = interaction.customId.replace('modal_simular_evento_', '');
        await LootSplitHandler.processSimulation(interaction, eventId);
        return;
      }

      // CONFIGURAÇÕES
      if (customId === 'modal_registrar_guilda') {
        await ConfigActions.processGuildRegistration(interaction);
        return;
      }

      if (customId === 'modal_taxa_guilda') {
        await ConfigActions.handleTaxaSelect(interaction);
        return;
      }

      // Taxas de Baú
      if (customId === 'modal_taxas_bau') {
        await ConfigActions.processTaxaBau(interaction);
        return;
      }

      // Taxa de Empréstimo
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

      // SISTEMA DE XP
      if (customId === 'modal_criar_xp_event') {
        await XpEventHandler.processCreateXpEvent(interaction);
        return;
      }

      if (customId.startsWith('modal_depositar_orb_')) {
        // Parse customId: modal_depositar_orb_TYPE_USER1,USER2...
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
    }

  } catch (error) {
    console.error('❌ Erro no handler de interações:', error);

    try {
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({
          content: '❌ Ocorreu um erro inesperado. Tente novamente.',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error('❌ Não foi possível responder ao usuário:', replyError);
    }
  }
});

// Evento: Membro sai do servidor
client.on(Events.GuildMemberRemove, async (member) => {
  await GuildMemberRemoveHandler.handle(member);
});

// Handler de Erros Globais
process.on('unhandledRejection', error => {
  console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('❌ Uncaught exception:', error);
});

// Salvar dados antes de encerrar
process.on('SIGINT', async () => {
  console.log('\n💾 Salvando dados antes de encerrar...');
  try {
    if (!fs.existsSync('./data')) {
      fs.mkdirSync('./data', { recursive: true });
    }

    fs.writeFileSync('./data/blacklist.json', JSON.stringify([...global.blacklist], null, 2));
    fs.writeFileSync('./data/historico.json', JSON.stringify([...global.historicoRegistros], null, 2));

    console.log('✅ Dados salvos com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao salvar dados:', error);
  }
  process.exit();
});

process.on('SIGTERM', async () => {
  console.log('\n💾 Salvando dados antes de encerrar (SIGTERM)...');
  try {
    if (!fs.existsSync('./data')) {
      fs.mkdirSync('./data', { recursive: true });
    }

    fs.writeFileSync('./data/blacklist.json', JSON.stringify([...global.blacklist], null, 2));
    fs.writeFileSync('./data/historico.json', JSON.stringify([...global.historicoRegistros], null, 2));

    console.log('✅ Dados salvos com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao salvar dados:', error);
  }
  process.exit();
});

// Login do Bot
client.login(process.env.TOKEN).then(() => {
  console.log('🔐 Login realizado com sucesso');
}).catch(error => {
  console.error('❌ Erro ao fazer login:', error);
  console.error('Verifique se o TOKEN no arquivo .env está correto.');
});