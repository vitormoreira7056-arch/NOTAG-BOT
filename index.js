const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
  Events,
  PermissionFlagsBits
} = require('discord.js');
require('dotenv').config();

// Importar Handlers
const RegistrationModal = require('./handlers/registrationModal');
const RegistrationActions = require('./handlers/registrationActions');
const ConfigActions = require('./handlers/configActions');
const GuildMemberRemoveHandler = require('./handlers/guildMemberRemove');

// Criar cliente
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildPresences // Necessário para status online/offline
  ],
  partials: ['CHANNEL']
});

// Coleção de comandos
client.commands = new Collection();

// Importar Comandos
const instalarCommand = require('./commands/instalar');
const desistalarCommand = require('./commands/desistalar');

// Registrar comandos na coleção
client.commands.set(instalarCommand.data.name, instalarCommand);
client.commands.set(desistalarCommand.data.name, desistalarCommand);

// Inicializar variáveis globais
global.registrosPendentes = new Map();
global.registroTemp = new Map();
global.guildConfig = new Map();

// Evento Ready
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot logado como ${client.user.tag}`);
  console.log(`🤖 ID do Bot: ${client.user.id}`);
  console.log(`📅 Data de início: ${new Date().toLocaleString()}`);

  // Registrar Slash Commands
  const commands = [
    instalarCommand.data.toJSON(),
    desistalarCommand.data.toJSON()
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

      // Sistema de Registro - Abrir Modal
      if (customId === 'btn_abrir_registro') {
        const modal = RegistrationModal.createRegistrationModal();
        await interaction.showModal(modal);
        return;
      }

      // Tentar novamente após erro de validação
      if (customId === 'btn_tentar_novamente_registro') {
        const modal = RegistrationModal.createRegistrationModal();
        await interaction.showModal(modal);
        return;
      }

      // Aprovações de Registro
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

      // Recusar Registro - Abre modal para motivo
      if (customId.startsWith('recusar_registro_')) {
        const regId = customId.replace('recusar_registro_', '');
        await RegistrationActions.handleRejectRegistration(interaction, regId);
        return;
      }

      // Lista de membros - Atualizar
      if (customId === 'btn_atualizar_lista_membros') {
        await interaction.deferUpdate();
        const MemberListPanel = require('./handlers/memberListPanel');
        await MemberListPanel.updatePanel(interaction.message, interaction.guild);
        return;
      }

      // Configurações do Bot
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
      // Sistema de Registro
      if (interaction.customId === 'select_server_registro') {
        await RegistrationModal.processServerSelect(interaction);
        return;
      }

      if (interaction.customId === 'select_platform_registro') {
        await RegistrationModal.processPlatformSelect(interaction, client);
        return;
      }

      // Configurações - Taxa Guilda
      if (interaction.customId === 'select_taxa_guilda') {
        await ConfigActions.handleTaxaSelect(interaction);
        return;
      }
    }

    // ==================== MODALS ====================
    if (interaction.isModalSubmit()) {
      // Sistema de Registro - Novo registro
      if (interaction.customId === 'modal_registro') {
        // Verificar duplicidade antes de processar
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

      // Recusa de registro com motivo
      if (interaction.customId.startsWith('modal_recusar_registro_')) {
        const regId = interaction.customId.replace('modal_recusar_registro_', '');
        await RegistrationActions.processRejectionWithReason(interaction, regId);
        return;
      }

      // Configurações - Registrar Guilda
      if (interaction.customId === 'modal_registrar_guilda') {
        await ConfigActions.processGuildRegistration(interaction);
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

// Evento: Membro sai do servidor (apenas para quem tinha cargo de registro)
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

// Login do Bot
client.login(process.env.TOKEN).then(() => {
  console.log('🔐 Login realizado com sucesso');
}).catch(error => {
  console.error('❌ Erro ao fazer login:', error);
  console.error('Verifique se o TOKEN no arquivo .env está correto.');
});