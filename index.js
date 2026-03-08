const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
  Events,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType
} = require('discord.js');
const fs = require('fs');
require('dotenv').config();

// ==================== IMPORTAR HANDLERS ====================
const RegistrationModal = require('./handlers/registrationModal');
const RegistrationActions = require('./handlers/registrationActions');
const ConfigActions = require('./handlers/configActions');
const GuildMemberRemoveHandler = require('./handlers/guildMemberRemove');
const EventPanel = require('./handlers/eventPanel');
const EventHandler = require('./handlers/eventHandler');
const LootSplitHandler = require('./handlers/lootSplitHandler');
const Database = require('./utils/database');
const DepositHandler = require('./handlers/depositHandler');
const FinanceHandler = require('./handlers/financeHandler');
const ConsultarSaldoHandler = require('./handlers/consultarSaldoHandler');
const PerfilHandler = require('./handlers/perfilHandler');
const OrbHandler = require('./handlers/orbHandler');
const XpHandler = require('./handlers/xpHandler');
const XpEventHandler = require('./handlers/xpEventHandler');

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

// ==================== IMPORTAR COMANDOS ====================
const instalarCommand = require('./commands/instalar');
const desistalarCommand = require('./commands/desistalar');
const atualizarCommand = require('./commands/atualizar');
const limparEventosCommand = require('./commands/limpar-eventos');
const limparSaldoCommand = require('./commands/limpar-saldo');
const limparXpCommand = require('./commands/limpar-xp');

// Registrar comandos na coleção
client.commands.set(instalarCommand.data.name, instalarCommand);
client.commands.set(desistalarCommand.data.name, desistalarCommand);
client.commands.set(atualizarCommand.data.name, atualizarCommand);
client.commands.set(limparEventosCommand.data.name, limparEventosCommand);
client.commands.set(limparSaldoCommand.data.name, limparSaldoCommand);
client.commands.set(limparXpCommand.data.name, limparXpCommand);

// ==================== INICIALIZAR VARIÁVEIS GLOBAIS ====================
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
global.pendingOrbDeposits = new Map();
global.activeXpEvents = new Map();
global.client = client;

// Carregar dados persistidos (blacklist e histórico)
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

// ==================== EVENTO READY ====================
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot logado como ${client.user.tag}`);
  console.log(`🤖 ID do Bot: ${client.user.id}`);
  console.log(`📅 Data de início: ${new Date().toLocaleString()}`);

  // Inicializar sistemas
  await Database.initialize();
  RegistrationActions.initialize();
  EventHandler.initialize();
  console.log('📝 Sistemas inicializados: Database + Registro + Eventos');

  // Registrar Slash Commands
  const commands = [
    instalarCommand.data.toJSON(),
    desistalarCommand.data.toJSON(),
    atualizarCommand.data.toJSON(),
    limparEventosCommand.data.toJSON(),
    limparSaldoCommand.data.toJSON(),
    limparXpCommand.data.toJSON()
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

// ==================== VERIFICAÇÃO DE ENTRADA EM CALL DE EVENTO ====================
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    // Se não entrou em um canal (saiu ou mudou), ignorar
    if (!newState.channelId) return;

    // Se entrou no mesmo canal (não mudou), ignorar
    if (oldState.channelId === newState.channelId) return;

    const member = newState.member;
    const channel = newState.channel;

    // Verificar se é um canal de evento (começa com ⚔️-)
    if (!channel.name.startsWith('⚔️-')) return;

    // Verificar se o usuário está em algum evento ativo
    let isParticipating = false;
    let eventData = null;

    // Verificar em todos os eventos ativos
    for (const [eventId, event] of global.activeEvents) {
      if (event.canalVozId === channel.id) {
        eventData = event;
        if (event.participantes.has(member.id)) {
          isParticipating = true;
        }
        break;
      }
    }

    // Se não está participando, remover da call
    if (!isParticipating && eventData) {
      console.log(`[VoiceState] Usuário ${member.id} tentou entrar na call ${channel.id} sem participar do evento`);

      // Tentar mover para "Aguardando-Evento" ou desconectar
      const canalAguardando = newState.guild.channels.cache.find(
        c => c.name === '🔊╠Aguardando-Evento' && c.type === ChannelType.GuildVoice
      );

      if (canalAguardando) {
        try {
          await member.voice.setChannel(canalAguardando.id);
          console.log(`[VoiceState] Movido ${member.id} para Aguardando-Evento`);
        } catch (e) {
          console.log(`[VoiceState] Não foi possível mover, desconectando...`);
          try {
            await member.voice.disconnect('Não está participando do evento');
          } catch (e2) {
            console.log(`[VoiceState] Não foi possível desconectar`);
          }
        }
      } else {
        // Se não tem canal de aguardar, desconectar
        try {
          await member.voice.disconnect('Não está participando do evento');
        } catch (e) {
          console.log(`[VoiceState] Não foi possível desconectar`);
        }
      }

      // Enviar DM explicando
      try {
        await member.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('⚠️ Acesso Negado')
              .setDescription(
                `Você tentou entrar na call do evento **${eventData.nome}** sem estar na lista de participantes.\n\n` +
                `👉 Clique no botão **"✋ Entrar no Evento"** no canal <#${eventData.canalTextoId}> para participar primeiro!`
              )
              .setColor(0xE74C3C)
              .setTimestamp()
          ]
        });
      } catch (e) {
        // Se não puder enviar DM, ignorar
      }
    }

  } catch (error) {
    console.error('[VoiceState] Erro na verificação:', error);
  }
});

// ==================== HANDLER PRINCIPAL DE INTERAÇÕES ====================
client.on(Events.InteractionCreate, async interaction => {
  try {
    // ==================== COMANDOS SLASH ====================
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        console.error(`❌ Comando não encontrado: ${interaction.commandName}`);
        return;
      }

      // Verificar permissões específicas
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

      // COMANDOS DE LIMPAR - Confirmações (são tratados pelos collectors dos comandos)
      if (customId === 'confirmar_limpar_eventos' || customId === 'cancelar_limpar_eventos' ||
          customId === 'confirmar_limpar_saldo' || customId === 'cancelar_limpar_saldo' ||
          customId === 'confirmar_limpar_xp' || customId === 'cancelar_limpar_xp') {
        return; // Ignorar aqui, o collector do comando vai processar
      }

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

      // SISTEMA DE EVENTOS - Painel Principal
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

      // SISTEMA DE EVENTOS - Ações do Evento
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

      // SISTEMA DE DEPÓSITO
      if (customId === 'btn_deposito_novo') {
        await DepositHandler.handleDepositoButton(interaction);
        return;
      }

      if (customId === 'btn_historico_depositos') {
        await DepositHandler.showHistorico(interaction);
        return;
      }

      if (customId === 'btn_ajuda_deposito') {
        await DepositHandler.showAjuda(interaction);
        return;
      }

      if (customId.startsWith('dep_aprovar_')) {
        const parts = customId.split('_');
        const depositId = parts[2];
        const userId = parts[3];
        const valor = parts[4];

        const isTesoureiro = interaction.member.roles.cache.some(r => r.name === 'tesoureiro') ||
          interaction.member.roles.cache.some(r => r.name === 'ADM') ||
          interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isTesoureiro) {
          return interaction.reply({
            content: '❌ Apenas tesoureiros podem aprovar depósitos!',
            ephemeral: true
          });
        }

        await DepositHandler.handleAprovacao(interaction, depositId, userId, valor, true);
        return;
      }

      if (customId.startsWith('dep_recusar_')) {
        const depositId = customId.replace('dep_recusar_', '');

        const isTesoureiro = interaction.member.roles.cache.some(r => r.name === 'tesoureiro') ||
          interaction.member.roles.cache.some(r => r.name === 'ADM') ||
          interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isTesoureiro) {
          return interaction.reply({
            content: '❌ Apenas tesoureiros podem recusar depósitos!',
            ephemeral: true
          });
        }

        await DepositHandler.handleAprovacao(interaction, depositId, null, null, false);
        return;
      }

      if (customId.startsWith('dep_verificar_')) {
        const comprovante = customId.replace('dep_verificar_', '');
        await interaction.reply({
          content: `📎 **Comprovante:** ${comprovante}`,
          ephemeral: true
        });
        return;
      }

      // SISTEMA DE CONSULTAR SALDO
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

      // SISTEMA FINANCEIRO - Aprovações/Recusas
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

      // ALBION ACADEMY - PERFIL
      if (customId === 'btn_criar_xp_event') {
        await XpEventHandler.showCreateEventModal(interaction);
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

      // ALBION ACADEMY - ORBS
      if (customId === 'btn_depositar_orb') {
        await OrbHandler.showUserSelect(interaction);
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

      // LISTA DE MEMBROS (PAINEL ANTIGO - manter compatibilidade)
      if (customId === 'btn_atualizar_lista_membros') {
        await interaction.deferUpdate();
        const MemberListPanel = require('./handlers/memberListPanel');
        await MemberListPanel.updatePanel(interaction.message, interaction.guild);
        return;
      }

      // PAINEL DE LISTA DE MEMBROS (NOVOS HANDLERS)
      if (customId === 'btn_mlist_atualizar') {
        const MemberListPanel = require('./handlers/memberListPanel');
        await MemberListPanel.handleAtualizar(interaction);
        return;
      }

      if (customId === 'btn_mlist_ver_lista') {
        const MemberListPanel = require('./handlers/memberListPanel');
        const members = Array.from((await interaction.guild.members.fetch()).values());
        await MemberListPanel.showMemberPage(interaction, members, 1, Math.ceil(members.length/10), 'all');
        return;
      }

      if (customId.startsWith('btn_mlist_page_')) {
        const MemberListPanel = require('./handlers/memberListPanel');
        if (customId.includes('next')) {
          await MemberListPanel.handlePageNavigation(interaction, 'next');
        } else if (customId.includes('prev')) {
          await MemberListPanel.handlePageNavigation(interaction, 'prev');
        }
        return;
      }

      if (customId === 'btn_mlist_voltar_resumo') {
        const MemberListPanel = require('./handlers/memberListPanel');
        await MemberListPanel.handleVoltarResumo(interaction);
        return;
      }

      if (customId === 'btn_mlist_stats') {
        const MemberListPanel = require('./handlers/memberListPanel');
        await MemberListPanel.handleStatsDetailed(interaction);
        return;
      }

      if (customId === 'btn_mlist_export') {
        const MemberListPanel = require('./handlers/memberListPanel');
        await MemberListPanel.handleExport(interaction);
        return;
      }

      // PAINEL DE ESTATÍSTICAS DE EVENTOS
      if (customId === 'btn_eventos_atualizar') {
        const EventStatsHandler = require('./handlers/eventStatsHandler');
        await EventStatsHandler.handleAtualizar(interaction);
        return;
      }

      if (customId === 'btn_eventos_exportar') {
        await interaction.reply({
          content: '⏳ Exportação de dados em desenvolvimento...',
          ephemeral: true
        });
        return;
      }

      if (customId === 'btn_eventos_ajuda') {
        await interaction.reply({
          content: '❓ **Painel de Eventos**\n\nUse os menus acima para filtrar eventos por período ou cargo.',
          ephemeral: true
        });
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
    }

    // ==================== SELECT MENUS ====================
    if (interaction.isStringSelectMenu()) {
      // REGISTRO
      if (interaction.customId === 'select_server_registro') {
        await RegistrationModal.processServerSelect(interaction);
        return;
      }

      if (interaction.customId === 'select_platform_registro') {
        await RegistrationModal.processPlatformSelect(interaction, client);
        return;
      }

      // CONFIGURAÇÕES
      if (interaction.customId === 'select_taxa_guilda') {
        await ConfigActions.handleTaxaSelect(interaction);
        return;
      }

      // ALBION ACADEMY - ORBS
      if (interaction.customId === 'select_orb_type') {
        const orbType = interaction.values[0];
        if (!global.orbTemp) global.orbTemp = new Map();
        global.orbTemp.set(interaction.user.id, { orbType });
        await OrbHandler.showOrbTypeSelect(interaction);
        return;
      }

      // PAINEL DE ESTATÍSTICAS DE EVENTOS
      if (interaction.customId === 'select_periodo_eventos') {
        const EventStatsHandler = require('./handlers/eventStatsHandler');
        await EventStatsHandler.handlePeriodSelect(interaction);
        return;
      }

      if (interaction.customId === 'select_cargo_eventos') {
        const EventStatsHandler = require('./handlers/eventStatsHandler');
        await EventStatsHandler.handleRoleSelect(interaction);
        return;
      }

      // PAINEL LISTA DE MEMBROS - FILTROS
      if (interaction.customId === 'mlist_filter_cargo') {
        const MemberListPanel = require('./handlers/memberListPanel');
        await MemberListPanel.handleFilterSelect(interaction);
        return;
      }

      if (interaction.customId === 'mlist_sort_by') {
        const MemberListPanel = require('./handlers/memberListPanel');
        await MemberListPanel.handleSortSelect(interaction);
        return;
      }
    }

    // ==================== USER SELECT MENUS ====================
    if (interaction.isUserSelectMenu()) {
      // ALBION ACADEMY - XP MANUAL
      if (interaction.customId === 'select_xp_target_user') {
        const targetUserId = interaction.values[0];
        await PerfilHandler.createManualXpModal(interaction, targetUserId);
        return;
      }

      // ALBION ACADEMY - ORBS
      if (interaction.customId === 'select_orb_users') {
        const selectedUsers = interaction.values;
        if (!global.orbTemp) global.orbTemp = new Map();
        const tempData = global.orbTemp.get(interaction.user.id) || {};
        tempData.users = selectedUsers;
        global.orbTemp.set(interaction.user.id, tempData);
        await OrbHandler.showOrbTypeSelect(interaction);
        return;
      }
    }

    // ==================== MODALS ====================
    if (interaction.isModalSubmit()) {
      // SISTEMA DE REGISTRO
      if (interaction.customId === 'modal_registro') {
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

      if (interaction.customId.startsWith('modal_recusar_registro_')) {
        const regId = interaction.customId.replace('modal_recusar_registro_', '');
        await RegistrationActions.processRejectionWithReason(interaction, regId);
        return;
      }

      if (interaction.customId.startsWith('modal_blacklist_')) {
        const regId = interaction.customId.replace('modal_blacklist_', '');
        await RegistrationActions.processBlacklistAdd(interaction, regId);
        return;
      }

      // SISTEMA DE EVENTOS
      if (interaction.customId === 'modal_criar_evento') {
        await EventHandler.createEvent(interaction);
        return;
      }

      // SISTEMA DE LOOTSPLIT
      if (interaction.customId.startsWith('modal_simular_evento_')) {
        const eventId = interaction.customId.replace('modal_simular_evento_', '');
        await LootSplitHandler.processSimulation(interaction, eventId);
        return;
      }

      // SISTEMA DE DEPÓSITO
      if (interaction.customId === 'modal_deposito_valor') {
        await DepositHandler.processDeposito(interaction);
        return;
      }

      // MODAIS DE FINANÇAS
      if (interaction.customId === 'modal_sacar_saldo') {
        await FinanceHandler.processWithdrawRequest(interaction);
        return;
      }

      if (interaction.customId === 'modal_solicitar_emprestimo') {
        await FinanceHandler.processLoanRequest(interaction);
        return;
      }

      if (interaction.customId === 'modal_transferir_saldo') {
        await FinanceHandler.processTransferRequest(interaction);
        return;
      }

      if (interaction.customId.startsWith('modal_motivo_recusa_saque_')) {
        const withdrawalId = interaction.customId.replace('modal_motivo_recusa_saque_', '');
        await FinanceHandler.processWithdrawalRejection(interaction, withdrawalId);
        return;
      }

      // ALBION ACADEMY - XP MANUAL
      if (interaction.customId.startsWith('modal_depositar_xp_')) {
        const targetUserId = interaction.customId.replace('modal_depositar_xp_', '');
        await PerfilHandler.processManualXpDeposit(interaction, targetUserId);
        return;
      }

      // ALBION ACADEMY - ORBS
      if (interaction.customId.startsWith('modal_depositar_orb_')) {
        const parts = interaction.customId.replace('modal_depositar_orb_', '').split('_');
        const orbType = parts[0];
        const userIds = parts[1].split(',');
        await OrbHandler.processOrbDeposit(interaction, orbType, userIds);
        return;
      }

      // CONFIGURAÇÕES
      if (interaction.customId === 'modal_taxa_guilda') {
        await ConfigActions.handleTaxaSelect(interaction);
        return;
      }

      if (interaction.customId === 'modal_taxas_bau') {
        await ConfigActions.processTaxaBau(interaction);
        return;
      }

      if (interaction.customId === 'modal_taxa_emprestimo') {
        await ConfigActions.processTaxaEmprestimo(interaction);
        return;
      }

      if (interaction.customId === 'modal_registrar_guilda') {
        await ConfigActions.processGuildRegistration(interaction);
        return;
      }
    }

  } catch (error) {
    console.error('❌ Erro no handler de interações:', error);

    try {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Ocorreu um erro inesperado. Tente novamente.',
          ephemeral: true
        });
      } else if (interaction.isRepliable() && interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content: '❌ Ocorreu um erro inesperado. Tente novamente.'
        });
      }
    } catch (replyError) {
      console.error('❌ Não foi possível responder ao usuário:', replyError);
    }
  }
});

// ==================== EVENTO: MEMBRO SAI DO SERVIDOR ====================
client.on(Events.GuildMemberRemove, async (member) => {
  await GuildMemberRemoveHandler.handle(member);
});

// ==================== HANDLERS DE ERROS ====================
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

// ==================== LOGIN DO BOT ====================
client.login(process.env.TOKEN).then(() => {
  console.log('🔐 Login realizado com sucesso');
}).catch(error => {
  console.error('❌ Erro ao fazer login:', error);
  console.error('Verifique se o TOKEN no arquivo .env está correto.');
});