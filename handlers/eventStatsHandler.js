/**
 * registrationActions.js - Sistema de Registro e Aprovação de Membros
 * 
 * VERSÃO CORRIGIDA - Timezone UTC Consistente
 * Compatível com database.js (timezone UTC)
 * 
 * REGRAS APLICADAS:
 * 1. Todas as datas via Database.getCurrentTimestamp() (UTC ms)
 * 2. Validação de blacklist antes de processar registros
 * 3. Workflow de aprovação: Member/Alliance/Guest com roles específicos
 * 4. Sanitização de inputs (nick, guilda, etc) contra injeção
 * 5. Logs de auditoria em todas as ações de aprovação/rejeição
 * 6. Limpeza de estado pendente após processamento
 */

const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const Database = require('./database.js');

/**
 * Status de registro
 */
const REGISTRATION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

/**
 * Tipos de aprovação
 */
const APPROVAL_TYPE = {
  MEMBER: 'member',
  ALLIANCE: 'alliance',
  GUEST: 'guest'
};

/**
 * Gerenciador de Ações de Registro
 */
class RegistrationActions {
  constructor() {
    // Map<userId, registrationData> - Registros pendentes em memória (temporário)
    this.pendingRegistrations = new Map();

    // Map<registrationId, lock> - Locks para operações atômicas
    this.operationLocks = new Map();

    console.log('[RegistrationActions] Inicializado com timezone UTC');
  }

  /**
   * Gera timestamp UTC via Database
   */
  getTimestamp() {
    return Database.getCurrentTimestamp();
  }

  /**
   * Sistema de locking para prevenir race conditions
   */
  async acquireLock(id) {
    const startTime = this.getTimestamp();
    const timeout = 5000; // 5s timeout

    while (this.operationLocks.has(id)) {
      if (this.getTimestamp() - startTime > timeout) {
        throw new Error(`Timeout acquiring lock for registration ${id}`);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.operationLocks.set(id, true);
    return () => this.operationLocks.delete(id);
  }

  /**
   * Sanitiza string de input (prevenir injeção e limitar tamanho)
   */
  sanitizeInput(input, maxLength = 100) {
    if (!input || typeof input !== 'string') return '';

    // Remove caracteres de controle e trim
    let clean = input.replace(/[\x00-\x1F\x7F]/g, '').trim();

    // Limita tamanho
    if (clean.length > maxLength) {
      clean = clean.substring(0, maxLength);
    }

    // Previne menções de everyone/here
    clean = clean.replace(/@(everyone|here)/gi, '@$1');

    return clean;
  }

  /**
   * Valida dados do formulário de registro
   */
  validateRegistrationData(data) {
    const errors = [];

    // Validação de nick (obrigatório, 3-30 chars)
    if (!data.nick || data.nick.length < 3 || data.nick.length > 30) {
      errors.push('Nick deve ter entre 3 e 30 caracteres');
    }

    // Validação de guilda (obrigatório para membros, opcional para guests)
    if (data.type === APPROVAL_TYPE.MEMBER && (!data.guildName || data.guildName.length < 2)) {
      errors.push('Nome da guilda é obrigatório para registro de membro');
    }

    // Validação de plataforma
    const validPlatforms = ['pc', 'mobile', 'ambos'];
    if (data.platform && !validPlatforms.includes(data.platform.toLowerCase())) {
      errors.push('Plataforma inválida (use: PC, Mobile ou Ambos)');
    }

    // Validação de tipo de registro
    const validTypes = Object.values(APPROVAL_TYPE);
    if (!data.type || !validTypes.includes(data.type)) {
      errors.push('Tipo de registro inválido');
    }

    if (errors.length > 0) {
      throw new Error(errors.join('\n'));
    }

    return true;
  }

  /**
   * Inicia processo de registro (abre modal)
   */
  async startRegistration(interaction, type = APPROVAL_TYPE.MEMBER) {
    try {
      console.log(`[startRegistration] Usuário ${interaction.user.id} iniciando registro tipo ${type}`);

      const userId = interaction.user.id;

      // Verifica se usuário já tem registro pendente
      const existingRegistration = await Database.getUserRegistration(interaction.guild.id, userId);
      if (existingRegistration && existingRegistration.status === REGISTRATION_STATUS.PENDING) {
        return interaction.reply({
          content: '⚠️ Você já possui um registro pendente de aprovação. Aguarde a moderação.',
          ephemeral: true
        });
      }

      // Verifica blacklist GLOBAL (impede registro se estiver na lista)
      const blacklistCheck = await Database.isBlacklisted(userId);
      if (blacklistCheck) {
        console.warn(`[Blacklist] Usuário ${userId} tentou registrar mas está na blacklist`);
        return interaction.reply({
          content: '❌ Você não possui permissão para se registrar neste servidor.',
          ephemeral: true
        });
      }

      // Cria modal de registro
      const modal = new ModalBuilder()
        .setCustomId(`registration_modal_${type}_${userId}`)
        .setTitle(`Registro de ${type.charAt(0).toUpperCase() + type.slice(1)}`);

      // Campos do modal
      const nickInput = new TextInputBuilder()
        .setCustomId('nick_input')
        .setLabel('Seu Nick em Albion Online')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: SirLancelot')
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(30);

      const guildInput = new TextInputBuilder()
        .setCustomId('guild_input')
        .setLabel('Nome da sua Guilda')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Noteworthy')
        .setRequired(type === APPROVAL_TYPE.MEMBER)
        .setMaxLength(50);

      const platformInput = new TextInputBuilder()
        .setCustomId('platform_input')
        .setLabel('Plataforma que joga')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('PC / Mobile / Ambos')
        .setRequired(false)
        .setMaxLength(20);

      const weaponInput = new TextInputBuilder()
        .setCustomId('weapon_input')
        .setLabel('Arma/Build principal')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Claymore, Frost Staff...')
        .setRequired(false)
        .setMaxLength(50);

      const screenshotInput = new TextInputBuilder()
        .setCustomId('screenshot_input')
        .setLabel('Link do screenshot do perfil (Imgur/Discord)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://...')
        .setRequired(false)
        .setMaxLength(200);

      // Adiciona campos ao modal
      modal.addComponents(
        new ActionRowBuilder().addComponents(nickInput),
        new ActionRowBuilder().addComponents(guildInput),
        new ActionRowBuilder().addComponents(platformInput),
        new ActionRowBuilder().addComponents(weaponInput),
        new ActionRowBuilder().addComponents(screenshotInput)
      );

      // Armazena tipo de registro em memória temporária (será usado no submit)
      this.pendingRegistrations.set(userId, {
        type: type,
        guildId: interaction.guild.id,
        startedAt: this.getTimestamp(),
        expiresAt: this.getTimestamp() + (15 * 60 * 1000) // Expira em 15 min
      });

      await interaction.showModal(modal);
      console.log(`[startRegistration] Modal exibido para usuário ${userId}`);

    } catch (error) {
      console.error(`[startRegistration] Erro:`, error);
      await interaction.reply({
        content: `❌ Erro ao iniciar registro: ${error.message}`,
        ephemeral: true
      }).catch(console.error);
    }
  }

  /**
   * Processa submissão do modal de registro
   */
  async handleModalSubmit(interaction) {
    const releaseLock = await this.acquireLock(`modal_${interaction.user.id}`).catch(() => null);

    try {
      console.log(`[handleModalSubmit] Processando modal para ${interaction.user.id}`);
      await interaction.deferReply({ ephemeral: true });

      const userId = interaction.user.id;

      // Recupera dados do processo de registro
      const pendingData = this.pendingRegistrations.get(userId);
      if (!pendingData) {
        throw new Error('Sessão de registro expirada ou inválida. Tente novamente.');
      }

      // Verifica se não expirou
      if (this.getTimestamp() > pendingData.expiresAt) {
        this.pendingRegistrations.delete(userId);
        throw new Error('Sessão de registro expirada (15 minutos). Tente novamente.');
      }

      // Extrai valores do modal
      const nick = this.sanitizeInput(interaction.fields.getTextInputValue('nick_input'), 30);
      const guildName = this.sanitizeInput(interaction.fields.getTextInputValue('guild_input'), 50);
      const platform = this.sanitizeInput(interaction.fields.getTextInputValue('platform_input'), 20);
      const weapon = this.sanitizeInput(interaction.fields.getTextInputValue('weapon_input'), 50);
      const screenshotUrl = this.sanitizeInput(interaction.fields.getTextInputValue('screenshot_input'), 200);

      // Valida dados
      const registrationData = {
        type: pendingData.type,
        nick,
        guildName,
        platform,
        weapon,
        screenshotUrl
      };

      this.validateRegistrationData(registrationData);

      const now = this.getTimestamp();

      // Salva no banco de dados
      const result = await Database.createRegistration({
        userId: userId,
        guildId: pendingData.guildId,
        nick: nick,
        guildName: guildName,
        platform: platform,
        weapon: weapon,
        screenshotUrl: screenshotUrl,
        type: pendingData.type,
        status: REGISTRATION_STATUS.PENDING
      });

      // Log de auditoria
      await Database.logAudit(pendingData.guildId, 'REGISTRATION_SUBMITTED', userId, {
        registrationId: result.id,
        nick,
        guildName,
        type: pendingData.type,
        timestamp: now
      });

      // Limpa pendente
      this.pendingRegistrations.delete(userId);

      // Envia confirmação ao usuário
      const embed = new EmbedBuilder()
        .setTitle('✅ Registro Enviado')
        .setDescription(`Seu registro como **${pendingData.type.toUpperCase()}** foi enviado para aprovação!`)
        .addFields(
          { name: '🎮 Nick', value: nick, inline: true },
          { name: '🏰 Guilda', value: guildName || 'N/A', inline: true },
          { name: '💻 Plataforma', value: platform || 'N/A', inline: true }
        )
        .setColor(0x3498db)
        .setTimestamp(now);

      await interaction.editReply({ embeds: [embed] });

      // Notifica canal de moderação (se configurado)
      await this.notifyModerators(interaction.guild, {
        id: result.id,
        userId,
        nick,
        guildName,
        platform,
        weapon,
        type: pendingData.type,
        timestamp: now
      });

      console.log(`[handleModalSubmit] Registro ${result.id} criado para ${userId}`);

    } catch (error) {
      console.error(`[handleModalSubmit] Erro:`, error);
      await interaction.editReply({
        content: `❌ Erro ao processar registro: ${error.message}`,
        ephemeral: true
      }).catch(console.error);
    } finally {
      if (releaseLock) releaseLock();
    }
  }

  /**
   * Aprova um registro pendente
   */
  async approveRegistration(interaction, registrationId, approvalType = null) {
    const releaseLock = await this.acquireLock(`reg_${registrationId}`);

    try {
      console.log(`[approveRegistration] Mod ${interaction.user.id} aprovando registro ${registrationId}`);
      await interaction.deferReply({ ephemeral: true });

      // Busca registro no banco
      const registration = await Database.getRegistrationById(registrationId);
      if (!registration) {
        throw new Error('Registro não encontrado');
      }

      if (registration.status !== REGISTRATION_STATUS.PENDING) {
        throw new Error(`Registro já foi ${registration.status}`);
      }

      // Verifica permissões do moderador
      const member = interaction.member;
      const hasPermission = member.permissions.has(PermissionFlagsBits.ManageRoles) || 
                           member.permissions.has(PermissionFlagsBits.Administrator);

      if (!hasPermission) {
        console.warn(`[Permission] Usuário ${member.id} tentou aprovar sem permissão`);
        return interaction.editReply({
          content: '❌ Você não tem permissão para aprovar registros.',
          ephemeral: true
        });
      }

      const now = this.getTimestamp();

      // Determina tipo de aprovação e roles
      const type = approvalType || registration.type || APPROVAL_TYPE.MEMBER;
      const guildConfig = await Database.getGuildConfig(interaction.guild.id);

      let roleId;
      let approvalMessage;

      switch (type) {
        case APPROVAL_TYPE.MEMBER:
          roleId = guildConfig.memberRole;
          approvalMessage = 'Bem-vindo à guilda!';
          break;
        case APPROVAL_TYPE.ALLIANCE:
          roleId = guildConfig.allianceRole;
          approvalMessage = 'Bem-vindo como Aliado!';
          break;
        case APPROVAL_TYPE.GUEST:
          roleId = guildConfig.guestRole;
          approvalMessage = 'Bem-vindo como Convidado!';
          break;
        default:
          throw new Error('Tipo de aprovação inválido');
      }

      // Atualiza status no banco
      await Database.updateRegistrationStatus(
        registrationId,
        REGISTRATION_STATUS.APPROVED,
        interaction.user.id,
        null
      );

      // Adiciona role ao usuário
      try {
        const targetMember = await interaction.guild.members.fetch(registration.user_id);
        if (targetMember && roleId) {
          const role = await interaction.guild.roles.fetch(roleId);
          if (role) {
            await targetMember.roles.add(role);
            console.log(`[approveRegistration] Role ${role.name} adicionada a ${registration.user_id}`);
          }
        }
      } catch (roleError) {
        console.error(`[approveRegistration] Erro ao adicionar role:`, roleError);
        // Continua mesmo se falhar a role (registro já foi aprovado no DB)
      }

      // Log de auditoria
      await Database.logAudit(interaction.guild.id, 'REGISTRATION_APPROVED', interaction.user.id, {
        registrationId,
        approvedUserId: registration.user_id,
        type: type,
        timestamp: now
      });

      // Notifica usuário aprovado (DM)
      try {
        const user = await interaction.client.users.fetch(registration.user_id);
        const dmEmbed = new EmbedBuilder()
          .setTitle('🎉 Registro Aprovado!')
          .setDescription(`Seu registro em **${interaction.guild.name}** foi aprovado!`)
          .addFields(
            { name: 'Tipo', value: type.toUpperCase(), inline: true },
            { name: 'Aprovado por', value: interaction.user.tag, inline: true }
          )
          .setColor(0x00ff00)
          .setTimestamp(now);

        await user.send({ embeds: [dmEmbed] });
      } catch (dmError) {
        console.log(`[approveRegistration] Não foi possível enviar DM para ${registration.user_id}`);
      }

      // Responde ao moderador
      await interaction.editReply({
        content: `✅ Registro de **${registration.nick}** aprovado como ${type.toUpperCase()}!`,
        ephemeral: true
      });

      console.log(`[approveRegistration] Registro ${registrationId} aprovado por ${interaction.user.id}`);

    } catch (error) {
      console.error(`[approveRegistration] Erro:`, error);
      await interaction.editReply({
        content: `❌ Erro ao aprovar: ${error.message}`,
        ephemeral: true
      }).catch(console.error);
      throw error;
    } finally {
      releaseLock();
    }
  }

  /**
   * Rejeita um registro
   */
  async rejectRegistration(interaction, registrationId, reason) {
    const releaseLock = await this.acquireLock(`reg_${registrationId}`);

    try {
      console.log(`[rejectRegistration] Mod ${interaction.user.id} rejeitando registro ${registrationId}`);
      await interaction.deferReply({ ephemeral: true });

      const registration = await Database.getRegistrationById(registrationId);
      if (!registration) {
        throw new Error('Registro não encontrado');
      }

      if (registration.status !== REGISTRATION_STATUS.PENDING) {
        throw new Error(`Registro já foi ${registration.status}`);
      }

      // Verifica permissões
      const member = interaction.member;
      const hasPermission = member.permissions.has(PermissionFlagsBits.ManageRoles) || 
                           member.permissions.has(PermissionFlagsBits.Administrator);

      if (!hasPermission) {
        return interaction.editReply({
          content: '❌ Sem permissão.',
          ephemeral: true
        });
      }

      const sanitizedReason = this.sanitizeInput(reason, 500);
      const now = this.getTimestamp();

      // Atualiza no banco
      await Database.updateRegistrationStatus(
        registrationId,
        REGISTRATION_STATUS.REJECTED,
        interaction.user.id,
        sanitizedReason
      );

      // Log de auditoria
      await Database.logAudit(interaction.guild.id, 'REGISTRATION_REJECTED', interaction.user.id, {
        registrationId,
        rejectedUserId: registration.user_id,
        reason: sanitizedReason,
        timestamp: now
      });

      // Notifica usuário
      try {
        const user = await interaction.client.users.fetch(registration.user_id);
        const dmEmbed = new EmbedBuilder()
          .setTitle('❌ Registro Rejeitado')
          .setDescription(`Seu registro em **${interaction.guild.name}** foi rejeitado.`)
          .addFields(
            { name: 'Motivo', value: sanitizedReason || 'Não especificado', inline: false },
            { name: 'Rejeitado por', value: interaction.user.tag, inline: true }
          )
          .setColor(0xff0000)
          .setTimestamp(now);

        await user.send({ embeds: [dmEmbed] });
      } catch (dmError) {
        console.log(`[rejectRegistration] Não foi possível enviar DM para ${registration.user_id}`);
      }

      await interaction.editReply({
        content: `❌ Registro de **${registration.nick}** rejeitado.`,
        ephemeral: true
      });

      console.log(`[rejectRegistration] Registro ${registrationId} rejeitado: ${sanitizedReason}`);

    } catch (error) {
      console.error(`[rejectRegistration] Erro:`, error);
      await interaction.editReply({
        content: `❌ Erro: ${error.message}`,
        ephemeral: true
      }).catch(console.error);
      throw error;
    } finally {
      releaseLock();
    }
  }

  /**
   * Notifica moderadores sobre novo registro
   */
  async notifyModerators(guild, registrationData) {
    try {
      const guildConfig = await Database.getGuildConfig(guild.id);
      const modChannelId = guildConfig.registrationChannel || guildConfig.logsChannel;

      if (!modChannelId) {
        console.log(`[notifyModerators] Canal de moderação não configurado para guild ${guild.id}`);
        return;
      }

      const channel = await guild.channels.fetch(modChannelId);
      if (!channel) return;

      const embed = new EmbedBuilder()
        .setTitle('📝 Novo Registro Pendente')
        .setDescription(`**${registrationData.nick}** solicitou registro como **${registrationData.type.toUpperCase()}**`)
        .addFields(
          { name: '🎮 Nick', value: registrationData.nick, inline: true },
          { name: '🏰 Guilda', value: registrationData.guildName || 'N/A', inline: true },
          { name: '💻 Plataforma', value: registrationData.platform || 'N/A', inline: true },
          { name: '⚔️ Arma Principal', value: registrationData.weapon || 'N/A', inline: true },
          { name: '🔗 Screenshot', value: registrationData.screenshotUrl || 'N/A', inline: false }
        )
        .setColor(0xffaa00)
        .setTimestamp(registrationData.timestamp)
        .setFooter({ text: `ID: ${registrationData.id} | User: ${registrationData.userId}` });

      // Botões de ação
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`reg_approve_member_${registrationData.id}`)
            .setLabel('Aprovar Membro')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`reg_approve_alliance_${registrationData.id}`)
            .setLabel('Aprovar Aliança')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`reg_approve_guest_${registrationData.id}`)
            .setLabel('Aprovar Convidado')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`reg_reject_${registrationData.id}`)
            .setLabel('Rejeitar')
            .setStyle(ButtonStyle.Danger)
        );

      await channel.send({ embeds: [embed], components: [row] });
      console.log(`[notifyModerators] Notificação enviada para canal ${modChannelId}`);

    } catch (error) {
      console.error(`[notifyModerators] Erro ao notificar:`, error);
    }
  }

  /**
   * Lista registros pendentes (para painel de moderação)
   */
  async listPendingRegistrations(guildId) {
    try {
      const registrations = await Database.getPendingRegistrations(guildId);

      return registrations.map(reg => ({
        ...reg,
        createdAtISO: Database.timestampToISO(reg.created_at),
        updatedAtISO: Database.timestampToISO(reg.updated_at)
      }));
    } catch (error) {
      console.error(`[listPendingRegistrations] Erro:`, error);
      return [];
    }
  }

  /**
   * Cleanup de sessões expiradas (chamar periodicamente)
   */
  cleanupExpiredSessions() {
    const now = this.getTimestamp();
    let cleaned = 0;

    for (const [userId, data] of this.pendingRegistrations) {
      if (now > data.expiresAt) {
        this.pendingRegistrations.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[RegistrationActions] ${cleaned} sessões expiradas limpas`);
    }
  }

  /**
   * Adiciona usuário à blacklist (integração com sistema global)
   */
  async blacklistUser(interaction, userId, reason) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const member = interaction.member;
      if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.editReply({
          content: '❌ Apenas administradores podem adicionar à blacklist.',
          ephemeral: true
        });
      }

      const sanitizedReason = this.sanitizeInput(reason, 500);
      const now = this.getTimestamp();

      // Busca dados do usuário se houver registro
      const registration = await Database.getUserRegistration(interaction.guild.id, userId);

      await Database.addToBlacklist(userId, {
        nick: registration?.nick || 'Unknown',
        guilda: registration?.guild_name || 'Unknown',
        motivo: sanitizedReason,
        addedBy: interaction.user.id,
        guildId: interaction.guild.id
      });

      // Log de auditoria
      await Database.logAudit(interaction.guild.id, 'BLACKLIST_ADD', interaction.user.id, {
        targetUserId: userId,
        reason: sanitizedReason,
        timestamp: now
      });

      await interaction.editReply({
        content: `🚫 Usuário adicionado à blacklist.\n**Motivo:** ${sanitizedReason}`,
        ephemeral: true
      });

      console.log(`[blacklistUser] Usuário ${userId} adicionado à blacklist por ${interaction.user.id}`);

    } catch (error) {
      console.error(`[blacklistUser] Erro:`, error);
      await interaction.editReply({
        content: `❌ Erro: ${error.message}`,
        ephemeral: true
      }).catch(console.error);
    }
  }

  /**
   * Busca estatísticas de registro do servidor
   */
  async getRegistrationStats(guildId) {
    try {
      // Busca no banco (assumindo que Database tem método para isso ou fazemos query raw)
      // Aqui simulando baseado nos métodos disponíveis no database.js
      const db = await Database.getGuildDb(guildId);

      const stats = await db.allAsync(`
        SELECT 
          status,
          COUNT(*) as count,
          DATE(created_at/1000, 'unixepoch') as date
        FROM registrations
        GROUP BY status, DATE(created_at/1000, 'unixepoch')
        ORDER BY date DESC
        LIMIT 30
      `);

      return stats;
    } catch (error) {
      console.error(`[getRegistrationStats] Erro:`, error);
      return [];
    }
  }

  /**
   * Cleanup de recursos
   */
  cleanup() {
    console.log('[RegistrationActions] Limpando recursos...');
    this.pendingRegistrations.clear();
    this.operationLocks.clear();
  }
}

module.exports = new RegistrationActions();