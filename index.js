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

// Importar Handlers do Sistema de Registro
const RegistrationModal = require('./handlers/registrationModal');
const RegistrationActions = require('./handlers/registrationActions');

// Criar cliente
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: ['CHANNEL'] // Necessário para receber DMs
});

// Coleção de comandos
client.commands = new Collection();

// Importar Comandos
const instalarCommand = require('./commands/instalar');
const desistalarCommand = require('./commands/desistalar');
const painelRegistroCommand = require('./commands/painel-registro');

// Registrar comandos na coleção
client.commands.set(instalarCommand.data.name, instalarCommand);
client.commands.set(desistalarCommand.data.name, desistalarCommand);
client.commands.set(painelRegistroCommand.data.name, painelRegistroCommand);

// Inicializar variáveis globais
global.registrosPendentes = new Map();
global.registroTemp = new Map();

// Evento Ready
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot logado como ${client.user.tag}`);
  console.log(`🤖 ID do Bot: ${client.user.id}`);
  console.log(`📅 Data de início: ${new Date().toLocaleString()}`);

  // Registrar Slash Commands
  const commands = [
    instalarCommand.data.toJSON(),
    desistalarCommand.data.toJSON(),
    painelRegistroCommand.data.toJSON()
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

      // Aprovar como Membro
      if (customId.startsWith('aprovar_membro_')) {
        const regId = customId.replace('aprovar_membro_', '');
        await RegistrationActions.approveAsMember(interaction, regId);
        return;
      }

      // Aprovar como Aliança
      if (customId.startsWith('aprovar_alianca_')) {
        const regId = customId.replace('aprovar_alianca_', '');
        await RegistrationActions.approveAsAlianca(interaction, regId);
        return;
      }

      // Aprovar como Convidado
      if (customId.startsWith('aprovar_convidado_')) {
        const regId = customId.replace('aprovar_convidado_', '');
        await RegistrationActions.approveAsConvidado(interaction, regId);
        return;
      }

      // Recusar Registro
      if (customId.startsWith('recusar_registro_')) {
        const regId = customId.replace('recusar_registro_', '');
        await RegistrationActions.rejectRegistration(interaction, regId);
        return;
      }
    }

    // ==================== SELECT MENUS ====================
    if (interaction.isStringSelectMenu()) {
      // Sistema de Registro - Seleção de Servidor
      if (interaction.customId === 'select_server_registro') {
        await RegistrationModal.processServerSelect(interaction);
        return;
      }

      // Sistema de Registro - Seleção de Plataforma
      if (interaction.customId === 'select_platform_registro') {
        await RegistrationModal.processPlatformSelect(interaction, client);
        return;
      }
    }

    // ==================== MODALS ====================
    if (interaction.isModalSubmit()) {
      // Sistema de Registro - Processar Modal
      if (interaction.customId === 'modal_registro') {
        await RegistrationModal.processRegistration(interaction, client);
        return;
      }
    }

  } catch (error) {
    console.error('❌ Erro no handler de interações:', error);

    // Tentar responder ao usuário se possível
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