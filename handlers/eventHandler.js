/**
 * eventHandler.js - Gerenciamento de Eventos Albion Online
 * 
 * VERSÃO CORRIGIDA - Timezone UTC + Proteção contra Crash em Canal Deletado
 * Compatível com database.js (timezone UTC)
 * 
 * REGRAS APLICADAS:
 * 1. Todos os timestamps via Database.getCurrentTimestamp() (UTC ms)
 * 2. Locks para prevenir race conditions em botões simultâneos
 * 3. Validação de estado em transições (scheduled->active->paused->ended)
 * 4. Limpeza de recursos (intervals, coleções) em finally blocks
 * 5. CRITICAL FIX: handleFinalizar verifica se canal existe antes de deletar
 * 6. Try-catch em todas as operações de Discord API (canais, cargos, movimentação)
 */

const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');
const Database = require('./database.js');

/**
 * Estados válidos de eventos
 */
const EVENT_STATUS = {
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  PAUSED: 'paused',
  ENDED: 'ended',
  CANCELLED: 'cancelled'
};

/**
 * Configurações de eventos
 */
const EVENT_CONFIG = {
  MAX_DURATION: 8 * 60 * 60 * 1000, // 8 horas máximo
  DEFAULT_DURATION: 60 * 60 * 1000,   // 1 hora padrão
  CHECK_INTERVAL: 30 * 1000,          // 30s check de voice
  LOCK_TIMEOUT: 10000                 // 10s timeout para locks
};

/**
 * Gerenciador de Eventos
 */
class EventHandler {
  constructor() {
    // Map<eventId, eventData> - Eventos ativos em memória
    this.activeEvents = new Map();

    // Map<eventId, Set<userId>> - Participantes em voz (para cálculo de tempo)
    this.voiceParticipants = new Map();

    // Map<eventId, IntervalId> - Intervalos de monitoramento
    this.monitoringIntervals = new Map();

    // Map<eventId, Promise> - Locks para operações atômicas
    this.operationLocks = new Map();

    // Map<eventId, processingUserId> - Track quem está processando
    this.processingEvents = new Map();

    console.log('[EventHandler] Inicializado com timezone UTC e proteção contra crash');
  }

  /**
   * Gera timestamp UTC atual via Database (consistente)
   */
  getTimestamp() {
    return Database.getCurrentTimestamp();
  }

  /**
   * Sistema de locking para operações atômicas (prevenir race conditions)
   * TIMEOUT: 10s para operações de finalização (mais seguro)
   */
  async acquireLock(eventId) {
    const startTime = this.getTimestamp();
    const timeout = EVENT_CONFIG.LOCK_TIMEOUT;

    while (this.operationLocks.has(eventId)) {
      if (this.getTimestamp() - startTime > timeout) {
        throw new Error(`Timeout acquiring lock for event ${eventId}`);
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.operationLocks.set(eventId, true);
    return () => this.operationLocks.delete(eventId);
  }

  /**
   * Marca evento como em processamento (evita duplo clique)
   */
  markAsProcessing(eventId, userId) {
    this.processingEvents.set(eventId, userId);
  }

  /**
   * Remove marcação de processamento
   */
  unmarkProcessing(eventId) {
    this.processingEvents.delete(eventId);
  }

  /**
   * Verifica se outro usuário está processando este evento
   */
  isBeingProcessedByAnother(eventId, userId) {
    const processingBy = this.processingEvents.get(eventId);
    return processingBy && processingBy !== userId;
  }

  /**
   * Validação de permissões administrativas
   */
  checkAdminPermissions(interaction, eventData) {
    const member = interaction.member;

    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator) || 
                   member.permissions.has(PermissionFlagsBits.ManageGuild);
    const isCreator = member.id === eventData.creatorId;

    if (!isAdmin && !isCreator) {
      console.warn(`[Permission] User ${member.id} denied access to event ${eventData.id}`);
      return false;
    }
    return true;
  }

  /**
   * Validação de transição de estado
   */
  validateStateTransition(currentStatus, newStatus) {
    const validTransitions = {
      [EVENT_STATUS.SCHEDULED]: [EVENT_STATUS.ACTIVE, EVENT_STATUS.CANCELLED],
      [EVENT_STATUS.ACTIVE]: [EVENT_STATUS.PAUSED, EVENT_STATUS.ENDED],
      [EVENT_STATUS.PAUSED]: [EVENT_STATUS.ACTIVE, EVENT_STATUS.ENDED],
      [EVENT_STATUS.ENDED]: [],
      [EVENT_STATUS.CANCELLED]: []
    };

    const allowed = validTransitions[currentStatus] || [];
    return allowed.includes(newStatus);
  }

  /**
   * Busca evento ativo por ID
   */
  getEvent(eventId) {
    return this.activeEvents.get(eventId);
  }

  /**
   * Lista eventos ativos de uma guilda
   */
  getGuildActiveEvents(guildId) {
    const events = [];
    for (const [eventId, eventData] of this.activeEvents) {
      if (eventData.guildId === guildId && 
          (eventData.status === EVENT_STATUS.SCHEDULED || 
           eventData.status === EVENT_STATUS.ACTIVE || 
           eventData.status === EVENT_STATUS.PAUSED)) {
        events.push({ id: eventId, ...eventData });
      }
    }
    return events.sort((a, b) => a.scheduledAt - b.scheduledAt);
  }

  /**
   * Cria um novo evento
   */
  async createEvent(interaction, eventData) {
    const releaseLock = await this.acquireLock('create').catch(() => null);

    try {
      console.log(`[createEvent] Iniciando criação por ${interaction.user.id}`);
      await interaction.deferReply({ ephemeral: true });

      // Validação de inputs
      if (!eventData.nome || eventData.nome.length > 100) {
        throw new Error('Nome do evento inválido (max 100 caracteres)');
      }

      // Validação e sanitização de timestamp agendado
      let scheduledAt = eventData.scheduledAt || this.getTimestamp();
      if (!Database.isValidTimestamp(scheduledAt)) {
        console.error(`[createEvent] scheduledAt inválido: ${scheduledAt}`);
        throw new Error('Data agendada inválida');
      }

      // Garante que evento não é no passado distante (mais de 1h atrás)
      const now = this.getTimestamp();
      if (scheduledAt < now - 3600000) {
        throw new Error('Não é possível agendar eventos no passado');
      }

      // Valida duração
      const duration = eventData.duration || EVENT_CONFIG.DEFAULT_DURATION;
      if (duration > EVENT_CONFIG.MAX_DURATION || duration < 60000) {
        throw new Error(`Duração deve ser entre 1 minuto e 8 horas`);
      }

      const eventId = `evt_${now}_${Math.random().toString(36).substr(2, 9)}`;

      const eventRecord = {
        id: eventId,
        guildId: interaction.guild.id,
        creatorId: interaction.user.id,
        nome: eventData.nome,
        descricao: eventData.descricao || '',
        tipo: eventData.tipo || 'normal',
        status: EVENT_STATUS.SCHEDULED,
        scheduledAt: scheduledAt,
        duration: duration,
        valorTotal: eventData.valorTotal || 0,
        taxaGuilda: eventData.taxaGuilda || 10,
        participantes: new Map(), // Map<userId, {joinedAt, timeConnected, checkinAt}>
        voiceChannelId: eventData.voiceChannelId || null,
        createdAt: now
      };

      // Salva no banco de dados
      await Database.saveEvent(interaction.guild.id, {
        id: eventId,
        criadorId: interaction.user.id,
        nome: eventData.nome,
        descricao: eventData.descricao,
        tipo: eventData.tipo,
        status: EVENT_STATUS.SCHEDULED,
        valorTotal: eventData.valorTotal,
        taxaGuilda: eventData.taxaGuilda,
        participantes: new Map(),
        inicioTimestamp: null,
        finalizadoEm: null
      });

      // Log de auditoria
      await Database.logAudit(interaction.guild.id, 'EVENT_CREATED', interaction.user.id, {
        eventId,
        nome: eventData.nome,
        scheduledAtISO: Database.timestampToISO(scheduledAt)
      });

      // Adiciona à memória
      this.activeEvents.set(eventId, eventRecord);

      console.log(`[createEvent] Evento ${eventId} criado, agendado para ${Database.timestampToISO(scheduledAt)}`);

      await interaction.editReply({
        content: `✅ Evento **${eventData.nome}** criado com sucesso!\n📅 Agendado para: <t:${Math.floor(scheduledAt/1000)}:F>`,
        ephemeral: true
      });

      return eventId;

    } catch (error) {
      console.error(`[createEvent] Erro:`, error);
      const reply = interaction.replied || interaction.deferred 
        ? interaction.editReply 
        : interaction.reply;
      await reply.call(interaction, {
        content: `❌ Erro ao criar evento: ${error.message}`,
        ephemeral: true
      }).catch(console.error);
      throw error;
    } finally {
      if (releaseLock) releaseLock();
    }
  }

  /**
   * Inicia um evento agendado
   */
  async handleIniciar(interaction, eventId) {
    const releaseLock = await this.acquireLock(eventId);

    try {
      if (this.isBeingProcessedByAnother(eventId, interaction.user.id)) {
        return interaction.reply({
          content: '⚠️ Outro usuário já está processando este evento. Aguarde.',
          ephemeral: true
        });
      }

      this.markAsProcessing(eventId, interaction.user.id);
      console.log(`[handleIniciar] Usuário ${interaction.user.id} iniciando evento ${eventId}`);

      await interaction.deferReply({ ephemeral: false });

      const eventData = this.activeEvents.get(eventId);
      if (!eventData) {
        throw new Error('Evento não encontrado na memória');
      }

      // Validação de permissões
      if (!this.checkAdminPermissions(interaction, eventData)) {
        return interaction.editReply({
          content: '❌ Você não tem permissão para iniciar este evento.',
          ephemeral: true
        });
      }

      // Validação de estado
      if (!this.validateStateTransition(eventData.status, EVENT_STATUS.ACTIVE)) {
        throw new Error(`Não é possível iniciar evento no estado: ${eventData.status}`);
      }

      const now = this.getTimestamp();

      // Atualiza dados
      eventData.status = EVENT_STATUS.ACTIVE;
      eventData.startedAt = now;
      eventData.totalPausedTime = 0;

      // Atualiza no banco
      await Database.saveEvent(interaction.guild.id, {
        id: eventId,
        criadorId: eventData.creatorId,
        nome: eventData.nome,
        descricao: eventData.descricao,
        tipo: eventData.tipo,
        status: EVENT_STATUS.ACTIVE,
        valorTotal: eventData.valorTotal,
        taxaGuilda: eventData.taxaGuilda,
        participantes: eventData.participantes,
        inicioTimestamp: now,
        finalizadoEm: null
      });

      // Inicia monitoramento de voice se houver canal configurado
      if (eventData.voiceChannelId) {
        this.startVoiceMonitoring(interaction.guild.id, eventId, eventData.voiceChannelId);
      }

      // Log de auditoria
      await Database.logAudit(interaction.guild.id, 'EVENT_STARTED', interaction.user.id, {
        eventId,
        startedAtISO: Database.timestampToISO(now)
      });

      console.log(`[handleIniciar] Evento ${eventId} iniciado em ${Database.timestampToISO(now)}`);

      await interaction.editReply({
        content: `🚀 Evento **${eventData.nome}** foi iniciado!\n⏰ Início: <t:${Math.floor(now/1000)}:T>`
      });

    } catch (error) {
      console.error(`[handleIniciar] Erro no evento ${eventId}:`, error);
      await interaction.editReply({
        content: `❌ Erro ao iniciar evento: ${error.message}`,
        ephemeral: true
      }).catch(console.error);
    } finally {
      this.unmarkProcessing(eventId);
      releaseLock();
    }
  }

  /**
   * Pausa um evento ativo
   */
  async handlePausar(interaction, eventId) {
    const releaseLock = await this.acquireLock(eventId);

    try {
      if (this.isBeingProcessedByAnother(eventId, interaction.user.id)) {
        return interaction.reply({
          content: '⚠️ Outro usuário já está processando este evento.',
          ephemeral: true
        });
      }

      this.markAsProcessing(eventId, interaction.user.id);
      console.log(`[handlePausar] Usuário ${interaction.user.id} pausando evento ${eventId}`);

      await interaction.deferReply({ ephemeral: true });

      const eventData = this.activeEvents.get(eventId);
      if (!eventData) throw new Error('Evento não encontrado');

      if (!this.checkAdminPermissions(interaction, eventData)) {
        return interaction.editReply({ content: '❌ Sem permissão.', ephemeral: true });
      }

      if (!this.validateStateTransition(eventData.status, EVENT_STATUS.PAUSED)) {
        throw new Error(`Não é possível pausar evento no estado: ${eventData.status}`);
      }

      const now = this.getTimestamp();
      eventData.status = EVENT_STATUS.PAUSED;
      eventData.pausedAt = now;

      // Para monitoramento de voice temporariamente
      this.stopVoiceMonitoring(eventId);

      await Database.saveEvent(interaction.guild.id, {
        ...eventData,
        status: EVENT_STATUS.PAUSED,
        inicioTimestamp: eventData.startedAt,
        finalizadoEm: null
      });

      await Database.logAudit(interaction.guild.id, 'EVENT_PAUSED', interaction.user.id, {
        eventId,
        pausedAtISO: Database.timestampToISO(now)
      });

      await interaction.editReply({
        content: `⏸️ Evento **${eventData.nome}** pausado.\n📊 Tempo ativo até agora: ${this.formatDuration(now - eventData.startedAt - (eventData.totalPausedTime || 0))}`
      });

    } catch (error) {
      console.error(`[handlePausar] Erro:`, error);
      await interaction.editReply({
        content: `❌ Erro: ${error.message}`,
        ephemeral: true
      });
    } finally {
      this.unmarkProcessing(eventId);
      releaseLock();
    }
  }

  /**
   * Retoma um evento pausado
   */
  async handleRetomar(interaction, eventId) {
    const releaseLock = await this.acquireLock(eventId);

    try {
      if (this.isBeingProcessedByAnother(eventId, interaction.user.id)) {
        return interaction.reply({
          content: '⚠️ Outro usuário já está processando este evento.',
          ephemeral: true
        });
      }

      this.markAsProcessing(eventId, interaction.user.id);
      console.log(`[handleRetomar] Usuário ${interaction.user.id} retomando evento ${eventId}`);

      await interaction.deferReply({ ephemeral: true });

      const eventData = this.activeEvents.get(eventId);
      if (!eventData) throw new Error('Evento não encontrado');

      if (!this.checkAdminPermissions(interaction, eventData)) {
        return interaction.editReply({ content: '❌ Sem permissão.', ephemeral: true });
      }

      if (!this.validateStateTransition(eventData.status, EVENT_STATUS.ACTIVE)) {
        throw new Error(`Não é possível retomar evento no estado: ${eventData.status}`);
      }

      const now = this.getTimestamp();
      const pauseDuration = now - eventData.pausedAt;
      eventData.totalPausedTime = (eventData.totalPausedTime || 0) + pauseDuration;
      eventData.status = EVENT_STATUS.ACTIVE;
      eventData.pausedAt = null;

      // Retoma monitoramento
      if (eventData.voiceChannelId) {
        this.startVoiceMonitoring(interaction.guild.id, eventId, eventData.voiceChannelId);
      }

      await Database.saveEvent(interaction.guild.id, {
        ...eventData,
        status: EVENT_STATUS.ACTIVE,
        inicioTimestamp: eventData.startedAt,
        finalizadoEm: null
      });

      await Database.logAudit(interaction.guild.id, 'EVENT_RESUMED', interaction.user.id, {
        eventId,
        pausedDuration: pauseDuration,
        totalPausedTime: eventData.totalPausedTime
      });

      await interaction.editReply({
        content: `▶️ Evento **${eventData.nome}** retomado.\n⏸️ Duração da pausa: ${this.formatDuration(pauseDuration)}`
      });

    } catch (error) {
      console.error(`[handleRetomar] Erro:`, error);
      await interaction.editReply({
        content: `❌ Erro: ${error.message}`,
        ephemeral: true
      });
    } finally {
      this.unmarkProcessing(eventId);
      releaseLock();
    }
  }

  /**
   * Finaliza um evento (VERSÃO CORRIGIDA - proteção contra canal já deletado)
   * CRITICAL FIX: Verifica se canal de voz existe antes de tentar deletar
   */
  async handleFinalizar(interaction, eventId) {
    const releaseLock = await this.acquireLock(eventId);

    try {
      if (this.isBeingProcessedByAnother(eventId, interaction.user.id)) {
        return interaction.reply({
          content: '⚠️ Outro usuário já está finalizando este evento. Aguarde.',
          ephemeral: true
        });
      }

      this.markAsProcessing(eventId, interaction.user.id);
      console.log(`[handleFinalizar] Usuário ${interaction.user.id} finalizando evento ${eventId}`);

      await interaction.deferReply({ ephemeral: false });

      const eventData = this.activeEvents.get(eventId);
      if (!eventData) throw new Error('Evento não encontrado');

      if (!this.checkAdminPermissions(interaction, eventData)) {
        return interaction.editReply({ 
          content: '❌ Sem permissão para finalizar.', 
          ephemeral: true 
        });
      }

      if (!this.validateStateTransition(eventData.status, EVENT_STATUS.ENDED)) {
        throw new Error(`Não é possível finalizar evento no estado: ${eventData.status}`);
      }

      const now = this.getTimestamp();

      // Calcula estatísticas finais
      const totalDuration = now - eventData.startedAt - (eventData.totalPausedTime || 0);

      eventData.status = EVENT_STATUS.ENDED;
      eventData.endedAt = now;

      // Para monitoramento
      this.stopVoiceMonitoring(eventId);

      // ========== OPERAÇÕES DE CANAL COM PROTEÇÃO ==========

      // Busca canal de aguardo (se existir)
      let canalAguardando = null;
      try {
        canalAguardando = interaction.guild.channels.cache.find(
          c => c.name === '🔊╠Aguardando-Evento'
        );
      } catch (e) {
        console.log('[handleFinalizar] Canal de aguardo não encontrado');
      }

      // CORREÇÃO CRÍTICA: Verifica se canalVoz existe antes de tentar usar
      let canalVoz = null;
      let canalVozDeletado = false;

      if (eventData.voiceChannelId) {
        try {
          // Tenta buscar o canal (pode falhar se já foi deletado)
          canalVoz = await interaction.guild.channels.fetch(eventData.voiceChannelId);
        } catch (fetchError) {
          // Código 10003 = Unknown Channel (já deletado)
          if (fetchError.code === 10003) {
            console.log(`[handleFinalizar] Canal de voz ${eventData.voiceChannelId} já estava deletado (10003)`);
            canalVozDeletado = true;
          } else {
            console.error(`[handleFinalizar] Erro ao buscar canal: ${fetchError.message}`);
            canalVozDeletado = true;
          }
          canalVoz = null;
        }
      }

      // Se tem canal de voz válido, tenta mover membros
      if (canalVoz) {
        console.log(`[handleFinalizar] Movendo membros do canal ${canalVoz.id}`);

        for (const [userId, participant] of eventData.participantes) {
          try {
            const member = await interaction.guild.members.fetch(userId).catch(() => null);

            // Só move se estiver no canal específico do evento
            if (member?.voice?.channelId === canalVoz.id) {
              if (canalAguardando) {
                await member.voice.setChannel(canalAguardando.id);
                console.log(`[handleFinalizar] Movido ${userId} para Aguardando-Evento`);
              } else {
                // Desconecta se não tem canal de aguardo
                await member.voice.disconnect();
                console.log(`[handleFinalizar] Desconectado ${userId} (sem canal de aguardo)`);
              }
            }
          } catch (moveError) {
            // Não crasha se não conseguir mover um membro específico
            console.log(`[handleFinalizar] Não foi possível mover/desconectar ${userId}: ${moveError.message}`);
            continue;
          }
        }

        // CORREÇÃO CRÍTICA: Tenta deletar canal com try-catch específico
        try {
          await canalVoz.delete('Evento finalizado');
          console.log(`[handleFinalizar] Canal de voz ${canalVoz.id} deletado com sucesso`);
          canalVozDeletado = true;
        } catch (deleteError) {
          // Se já foi deletado manualmente ou por outro processo, apenas loga
          if (deleteError.code === 10003) { // Unknown Channel
            console.log(`[handleFinalizar] Canal de voz já estava deletado manualmente (10003)`);
            canalVozDeletado = true;
          } else {
            console.error(`[handleFinalizar] Erro ao deletar canal: ${deleteError.message}`);
            // NÃO JOGA O ERRO - continua execução
          }
        }
      } else if (!canalVozDeletado) {
        console.log(`[handleFinalizar] Sem canal de voz configurado para este evento`);
      }

      // Atualiza no banco (mesmo se canal já foi deletado)
      await Database.saveEvent(interaction.guild.id, {
        ...eventData,
        status: EVENT_STATUS.ENDED,
        inicioTimestamp: eventData.startedAt,
        finalizadoEm: now
      });

      // Adiciona histórico detalhado
      await Database.addEventHistory(interaction.guild.id, {
        eventId,
        arquivadoPor: interaction.user.id,
        timestamp: now,
        dados: {
          duracaoTotal: totalDuration,
          duracaoEfetiva: totalDuration - (eventData.totalPausedTime || 0),
          participantes: Array.from(eventData.participantes.entries()).map(([id, data]) => ({
            userId: id,
            tempoConectado: data.timeConnected,
            checkin: data.checkinAt
          })),
          canalVozDeletado: canalVozDeletado,
          canalVozExisted: !!eventData.voiceChannelId
        }
      });

      // Log de auditoria
      await Database.logAudit(interaction.guild.id, 'EVENT_ENDED', interaction.user.id, {
        eventId,
        duration: totalDuration,
        participants: eventData.participantes.size,
        canalVozDeletado: canalVozDeletado
      });

      // Cleanup de memória (mantém por 1 hora para consultas)
      setTimeout(() => {
        this.activeEvents.delete(eventId);
        this.voiceParticipants.delete(eventId);
        console.log(`[Cleanup] Evento ${eventId} removido da memória`);
      }, 60 * 60 * 1000);

      // Resposta de sucesso (informa status do canal)
      const embed = new EmbedBuilder()
        .setTitle('🏁 Evento Finalizado')
        .setDescription(`**${eventData.nome}** foi encerrado.`)
        .addFields(
          { 
            name: '⏱️ Duração Total', 
            value: this.formatDuration(totalDuration), 
            inline: true 
          },
          { 
            name: '👥 Participantes', 
            value: `${eventData.participantes.size}`, 
            inline: true 
          },
          { 
            name: '🔊 Canal de Voz', 
            value: canalVozDeletado ? 
              (canalVoz ? '✅ Deletado automaticamente' : 'ℹ️ Já estava deletado') : 
              'Não configurado', 
            inline: true 
          }
        )
        .setTimestamp(now)
        .setColor(0x00FF00);

      await interaction.editReply({ embeds: [embed] });

      console.log(`[handleFinalizar] Evento ${eventId} finalizado com sucesso`);

    } catch (error) {
      console.error(`[handleFinalizar] Erro:`, error);
      await interaction.editReply({
        content: `❌ Erro ao finalizar evento: ${error.message}`,
        ephemeral: true
      }).catch(console.error);
    } finally {
      this.unmarkProcessing(eventId);
      releaseLock();
    }
  }

  /**
   * Usuário entra no evento (botão participar)
   */
  async handleParticipar(interaction, eventId) {
    const releaseLock = await this.acquireLock(eventId);

    try {
      console.log(`[handleParticipar] Usuário ${interaction.user.id} entrando no evento ${eventId}`);

      const eventData = this.activeEvents.get(eventId);
      if (!eventData) throw new Error('Evento não encontrado');

      if (eventData.status === EVENT_STATUS.ENDED || eventData.status === EVENT_STATUS.CANCELLED) {
        throw new Error('Este evento já foi encerrado');
      }

      const userId = interaction.user.id;
      const now = this.getTimestamp();

      // Verifica se já está participando
      if (eventData.participantes.has(userId)) {
        return interaction.reply({
          content: '⚠️ Você já está participando deste evento!',
          ephemeral: true
        });
      }

      // Adiciona participante
      eventData.participantes.set(userId, {
        joinedAt: now,
        timeConnected: 0,
        checkinAt: null,
        lastJoinVoice: null
      });

      // Se evento já está ativo e usuário está no voice, conta tempo imediatamente
      if (eventData.status === EVENT_STATUS.ACTIVE && eventData.voiceChannelId) {
        const member = await interaction.guild.members.fetch(userId);
        if (member.voice.channelId === eventData.voiceChannelId) {
          const participant = eventData.participantes.get(userId);
          participant.lastJoinVoice = now;
          console.log(`[handleParticipar] Usuário ${userId} já está no voice, iniciando contagem`);
        }
      }

      await interaction.reply({
        content: `✅ Você entrou no evento **${eventData.nome}**!\n📊 Seu tempo começará a ser contado quando você entrar no canal de voz.`,
        ephemeral: true
      });

    } catch (error) {
      console.error(`[handleParticipar] Erro:`, error);
      await interaction.reply({
        content: `❌ Erro: ${error.message}`,
        ephemeral: true
      }).catch(console.error);
    } finally {
      releaseLock();
    }
  }

  /**
   * Monitoramento de canal de voz (Voice State Update)
   */
  handleVoiceStateUpdate(oldState, newState) {
    const userId = oldState.member.id;
    const guildId = oldState.guild.id;
    const now = this.getTimestamp();

    // Verifica todos os eventos ativos desta guilda
    for (const [eventId, eventData] of this.activeEvents) {
      if (eventData.guildId !== guildId) continue;
      if (eventData.status !== EVENT_STATUS.ACTIVE) continue;
      if (!eventData.voiceChannelId) continue;

      const isTargetChannel = eventData.voiceChannelId;
      const wasInChannel = oldState.channelId === isTargetChannel;
      const isInChannel = newState.channelId === isTargetChannel;

      // Entrou no canal do evento
      if (!wasInChannel && isInChannel) {
        if (eventData.participantes.has(userId)) {
          const participant = eventData.participantes.get(userId);
          participant.lastJoinVoice = now;
          participant.checkinAt = now; // Check-in automático

          console.log(`[VoiceMonitor] Usuário ${userId} entrou no voice do evento ${eventId} em ${Database.timestampToISO(now)}`);

          // Log de check-in opcional
          Database.logAudit(guildId, 'VOICE_CHECKIN', userId, {
            eventId,
            channelId: isTargetChannel,
            timestamp: now
          }).catch(console.error);
        }
      }

      // Saiu do canal do evento
      else if (wasInChannel && !isInChannel) {
        if (eventData.participantes.has(userId)) {
          const participant = eventData.participantes.get(userId);

          if (participant.lastJoinVoice) {
            const sessionTime = now - participant.lastJoinVoice;
            participant.timeConnected = (participant.timeConnected || 0) + sessionTime;
            participant.lastJoinVoice = null;

            console.log(`[VoiceMonitor] Usuário ${userId} saiu do voice do evento ${eventId}. Sessão: ${sessionTime}ms`);
          }
        }
      }
    }
  }

  /**
   * Inicia monitoramento periódico do evento
   */
  startVoiceMonitoring(guildId, eventId, channelId) {
    console.log(`[Monitor] Iniciando monitoramento do evento ${eventId} no canal ${channelId}`);

    // Intervalo de verificação (backup para casos onde voiceStateUpdate falha)
    const interval = setInterval(async () => {
      try {
        const eventData = this.activeEvents.get(eventId);
        if (!eventData || eventData.status !== EVENT_STATUS.ACTIVE) {
          this.stopVoiceMonitoring(eventId);
          return;
        }

        const guild = await global.client.guilds.fetch(guildId).catch(() => null);
        if (!guild) return;

        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) {
          // Canal foi deletado durante o evento, para monitoramento
          console.log(`[Monitor] Canal ${channelId} deletado, parando monitoramento`);
          this.stopVoiceMonitoring(eventId);
          return;
        }

        const now = this.getTimestamp();

        // Verifica membros atualmente no canal
        for (const [memberId, member] of channel.members) {
          if (eventData.participantes.has(memberId)) {
            const participant = eventData.participantes.get(memberId);

            // Se não tem registro de entrada, cria um (recuperação de falha)
            if (!participant.lastJoinVoice) {
              participant.lastJoinVoice = now;
              console.log(`[Monitor] Recuperação: Usuário ${memberId} marcado como presente`);
            }
          }
        }
      } catch (error) {
        console.error(`[Monitor] Erro no intervalo do evento ${eventId}:`, error);
      }
    }, EVENT_CONFIG.CHECK_INTERVAL);

    this.monitoringIntervals.set(eventId, interval);
  }

  /**
   * Para monitoramento de evento
   */
  stopVoiceMonitoring(eventId) {
    const interval = this.monitoringIntervals.get(eventId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(eventId);
      console.log(`[Monitor] Monitoramento do evento ${eventId} encerrado`);
    }
  }

  /**
   * Calcula estatísticas finais do evento
   */
  calculateFinalStats(eventData) {
    const now = this.getTimestamp();
    const stats = {
      totalParticipants: eventData.participantes.size,
      totalTimeConnected: 0,
      averageTime: 0,
      topParticipants: []
    };

    const participantList = [];

    for (const [userId, data] of eventData.participantes) {
      let totalTime = data.timeConnected || 0;

      // Se ainda está no voice, adiciona tempo da sessão atual
      if (data.lastJoinVoice && eventData.status === EVENT_STATUS.ACTIVE) {
        totalTime += now - data.lastJoinVoice;
      }

      stats.totalTimeConnected += totalTime;
      participantList.push({ userId, timeConnected: totalTime });
    }

    if (participantList.length > 0) {
      stats.averageTime = Math.floor(stats.totalTimeConnected / participantList.length);
      stats.topParticipants = participantList
        .sort((a, b) => b.timeConnected - a.timeConnected)
        .slice(0, 5);
    }

    return stats;
  }

  /**
   * Formata duração em ms para string legível
   */
  formatDuration(ms) {
    if (ms < 0) ms = 0;
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  /**
   * Atualiza painel do evento na mensagem original
   */
  async updateEventPanel(interaction, eventData) {
    try {
      const guildId = interaction.guild.id;

      // Verificar se é do mesmo servidor
      if (eventData.guildId && eventData.guildId !== guildId) {
        console.error('[updateEventPanel] Tentativa de atualizar evento de outro servidor');
        return;
      }

      const canal = interaction.guild.channels.cache.get(eventData.canalTextoId);
      if (!canal) return;

      const msg = await canal.messages.fetch(eventData.messageId).catch(() => null);
      if (!msg) return;

      // Recriar embed atualizado
      const embed = new EmbedBuilder()
        .setTitle(`${eventData.status === 'active' ? '🔴' : '⏳'} ${eventData.nome}`)
        .setDescription(eventData.descricao || 'Sem descrição')
        .addFields(
          { name: 'Status', value: eventData.status.toUpperCase(), inline: true },
          { name: 'Participantes', value: `${eventData.participantes.size}`, inline: true }
        )
        .setColor(eventData.status === 'active' ? 0x00FF00 : 0xFFA500)
        .setTimestamp(this.getTimestamp());

      // Aqui você pode adicionar botões atualizados se necessário
      await msg.edit({ embeds: [embed] });

    } catch (error) {
      console.error(`[updateEventPanel] Erro:`, error);
    }
  }

  /**
   * Cleanup de recursos (chamar no shutdown do bot)
   */
  cleanup() {
    console.log('[EventHandler] Iniciando cleanup de recursos...');

    for (const [eventId, interval] of this.monitoringIntervals) {
      clearInterval(interval);
      console.log(`[Cleanup] Intervalo do evento ${eventId} limpo`);
    }
    this.monitoringIntervals.clear();

    this.activeEvents.clear();
    this.voiceParticipants.clear();
    this.operationLocks.clear();
    this.processingEvents.clear();

    console.log('[EventHandler] Cleanup concluído');
  }
}

module.exports = new EventHandler();