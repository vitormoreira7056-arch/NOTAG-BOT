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

// Importar Handlers
const RegistrationModal = require('./handlers/registrationModal');
const RegistrationActions = require('./handlers/registrationActions');
const ConfigActions = require('./handlers/configActions');
const GuildMemberRemoveHandler = require('./handlers/guildMemberRemove');
const EventPanel = require('./handlers/eventPanel');
const EventHandler = require('./handlers/eventHandler');
const LootSplitHandler = require('./handlers/lootSplitHandler');
const Database = require('./utils/database');
const DepositHandler = require('./handlers/depositHandler');

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

      // SISTEMA DE CONSULTAR SALDO (NOVO)
      if (customId === 'btn_consultar_saldo') {
        const ConsultarSaldoHandler = require('./handlers/consultarSaldoHandler');
        await ConsultarSaldoHandler.handleConsultarSaldo(interaction);
        return;
      }

      if (customId === 'btn_sacar_saldo') {
        const ConsultarSaldoHandler = require('./handlers/consultarSaldoHandler');
        await ConsultarSaldoHandler.handleSacarSaldo(interaction);
        return;
      }

      if (customId === 'btn_solicitar_emprestimo') {
        const ConsultarSaldoHandler = require('./handlers/consultarSaldoHandler');
        await ConsultarSaldoHandler.handleSolicitarEmprestimo(interaction);
        return;
      }

      if (customId === 'btn_transferir_saldo') {
        const ConsultarSaldoHandler = require('./handlers/consultarSaldoHandler');
        await ConsultarSaldoHandler.handleTransferirSaldo(interaction);
        return;
      }

      // LISTA DE MEMBROS
      if (customId === 'btn_atualizar_lista_membros') {
        await interaction.deferUpdate();
        const MemberListPanel = require('./handlers/memberListPanel');
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

      // MODAIS DE FINANÇAS (Consultar Saldo) - NOVO
      if (interaction.customId === 'modal_sacar_saldo') {
        await processWithdrawal(interaction);
        return;
      }

      if (interaction.customId === 'modal_solicitar_emprestimo') {
        await processLoanRequest(interaction);
        return;
      }

      if (interaction.customId === 'modal_transferir_saldo') {
        await processTransfer(interaction);
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

// Evento: Membro sai do servidor
client.on(Events.GuildMemberRemove, async (member) => {
  await GuildMemberRemoveHandler.handle(member);
});

// ==================== FUNÇÕES AUXILIARES DE FINANÇAS ====================

async function processWithdrawal(interaction) {
  try {
    const valor = parseFloat(interaction.fields.getTextInputValue('valor_saque'));

    if (isNaN(valor) || valor <= 0) {
      return interaction.reply({
        content: '❌ Valor inválido! Digite um número positivo.',
        ephemeral: true
      });
    }

    const userId = interaction.user.id;
    const saldoAtual = Database.getSaldo(userId);
    const valorUnidades = valor * 1000000;

    if (saldoAtual < valorUnidades) {
      return interaction.reply({
        content: `❌ Saldo insuficiente!\n💰 Seu saldo: ${(saldoAtual / 1000000).toFixed(2)} milhões\n💸 Valor solicitado: ${valor} milhões`,
        ephemeral: true
      });
    }

    // Criar solicitação de saque (pendente de aprovação)
    const logChannel = interaction.guild.channels.cache.find(c => c.name === '📜╠logs-banco');
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle('💸 NOVA SOLICITAÇÃO DE SAQUE')
        .setDescription(`Usuário: ${interaction.user}`)
        .addFields(
          { name: 'Valor', value: `${valor} milhões`, inline: true },
          { name: 'Status', value: '⏳ Pendente', inline: true }
        )
        .setColor(0xF39C12)
        .setTimestamp();

      const tesoureiroRole = interaction.guild.roles.cache.find(r => r.name === 'tesoureiro');
      const mention = tesoureiroRole ? `<@&${tesoureiroRole.id}>` : '@tesoureiro';

      await logChannel.send({ 
        content: `${mention} Nova solicitação de saque!`,
        embeds: [embed] 
      });
    }

    await interaction.reply({
      content: `✅ Solicitação de saque de **${valor} milhões** enviada!\n⏳ Aguarde aprovação de um tesoureiro.`,
      ephemeral: true
    });

    console.log(`[Finance] Withdrawal request: ${valor}M by ${interaction.user.tag}`);

  } catch (error) {
    console.error('[Finance] Error processing withdrawal:', error);
    await interaction.reply({
      content: '❌ Erro ao processar saque. Tente novamente.',
      ephemeral: true
    });
  }
}

async function processLoanRequest(interaction) {
  try {
    const valor = parseFloat(interaction.fields.getTextInputValue('valor_emprestimo'));
    const motivo = interaction.fields.getTextInputValue('motivo_emprestimo');

    if (isNaN(valor) || valor <= 0) {
      return interaction.reply({
        content: '❌ Valor inválido! Digite um número positivo.',
        ephemeral: true
      });
    }

    const logChannel = interaction.guild.channels.cache.find(c => c.name === '📜╠logs-banco');
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle('💳 NOVA SOLICITAÇÃO DE EMPRÉSTIMO')
        .setDescription(`Usuário: ${interaction.user}`)
        .addFields(
          { name: 'Valor', value: `${valor} milhões`, inline: true },
          { name: 'Motivo', value: motivo, inline: false }
        )
        .setColor(0x3498DB)
        .setTimestamp();

      const tesoureiroRole = interaction.guild.roles.cache.find(r => r.name === 'tesoureiro');
      const mention = tesoureiroRole ? `<@&${tesoureiroRole.id}>` : '@tesoureiro';

      await logChannel.send({ 
        content: `${mention} Nova solicitação de empréstimo!`,
        embeds: [embed] 
      });
    }

    await interaction.reply({
      content: `✅ Solicitação de empréstimo de **${valor} milhões** enviada!\n⏳ Aguarde análise da staff.`,
      ephemeral: true
    });

    console.log(`[Finance] Loan request: ${valor}M by ${interaction.user.tag}`);

  } catch (error) {
    console.error('[Finance] Error processing loan:', error);
    await interaction.reply({
      content: '❌ Erro ao processar empréstimo. Tente novamente.',
      ephemeral: true
    });
  }
}

async function processTransfer(interaction) {
  try {
    const destino = interaction.fields.getTextInputValue('destino_transferencia').trim();
    const valor = parseFloat(interaction.fields.getTextInputValue('valor_transferencia'));

    if (isNaN(valor) || valor <= 0) {
      return interaction.reply({
        content: '❌ Valor inválido! Digite um número positivo.',
        ephemeral: true
      });
    }

    // Verificar se o destinatário existe (por nick)
    const membros = await interaction.guild.members.fetch();
    const destinatario = membros.find(m => 
      m.nickname?.toLowerCase() === destino.toLowerCase() || 
      m.user.username.toLowerCase() === destino.toLowerCase()
    );

    if (!destinatario) {
      return interaction.reply({
        content: '❌ Destinatário não encontrado! Verifique o nick.',
        ephemeral: true
      });
    }

    if (destinatario.id === interaction.user.id) {
      return interaction.reply({
        content: '❌ Você não pode transferir para si mesmo!',
        ephemeral: true
      });
    }

    const userId = interaction.user.id;
    const saldoAtual = Database.getSaldo(userId);
    const valorUnidades = valor * 1000000;

    if (saldoAtual < valorUnidades) {
      return interaction.reply({
        content: `❌ Saldo insuficiente!\n💰 Seu saldo: ${(saldoAtual / 1000000).toFixed(2)} milhões\n💸 Valor da transferência: ${valor} milhões`,
        ephemeral: true
      });
    }

    // Realizar transferência
    Database.removeSaldo(userId, valorUnidades, `Transferência para ${destino}`);
    Database.addSaldo(destinatario.id, valorUnidades, `Transferência de ${interaction.user.username}`);

    await interaction.reply({
      content: `✅ Transferência de **${valor} milhões** para **${destino}** realizada com sucesso!`,
      ephemeral: true
    });

    // Notificar destinatário
    try {
      await destinatario.send({
        embeds: [new EmbedBuilder()
          .setTitle('💰 Transferência Recebida!')
          .setDescription(`Você recebeu **${valor} milhões** de ${interaction.user.username}!`)
          .setColor(0x2ECC71)
          .setTimestamp()
        ]
      });
    } catch (e) {
      console.log(`[Finance] Could not notify recipient ${destinatario.id}`);
    }

    console.log(`[Finance] Transfer: ${valor}M from ${interaction.user.tag} to ${destinatario.user.tag}`);

  } catch (error) {
    console.error('[Finance] Error processing transfer:', error);
    await interaction.reply({
      content: '❌ Erro ao processar transferência. Tente novamente.',
      ephemeral: true
    });
  }
}

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

// Login do Bot
client.login(process.env.TOKEN).then(() => {
  console.log('🔐 Login realizado com sucesso');
}).catch(error => {
  console.error('❌ Erro ao fazer login:', error);
  console.error('Verifique se o TOKEN no arquivo .env está correto.');
});