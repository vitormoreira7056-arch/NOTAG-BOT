const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');

class EventHandler {
  constructor() {
    // Mapa de eventos ativos
    this.activeEvents = new Map();
  }

  // Inicializar estrutura global
  static initialize() {
    if (!global.activeEvents) global.activeEvents = new Map();
  }

  // Criar novo evento
  static async createEvent(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const nome = interaction.fields.getTextInputValue('evt_nome');
      const descricao = interaction.fields.getTextInputValue('evt_descricao');
      const requisitos = interaction.fields.getTextInputValue('evt_requisitos') || 'Nenhum';
      const horario = interaction.fields.getTextInputValue('evt_horario');

      const guild = interaction.guild;
      const eventId = `event_${Date.now()}_${interaction.user.id}`;

      // Buscar canais e categorias
      const categoriaAtivos = guild.channels.cache.find(
        c => c.name === '⚔️ EVENTOS ATIVOS' && c.type === ChannelType.GuildCategory
      );

      const canalParticipar = guild.channels.cache.find(
        c => c.name === '👋╠participar'
      );

      if (!categoriaAtivos) {
        return interaction.editReply({
          content: '❌ Categoria "⚔️ EVENTOS ATIVOS" não encontrada! Use /instalar primeiro.'
        });
      }

      if (!canalParticipar) {
        return interaction.editReply({
          content: '❌ Canal "👋╠participar" não encontrado!'
        });
      }

      // Criar canal de voz temporário
      const canalVoz = await guild.channels.create({
        name: `⚔️-${nome.substring(0, 20)}`,
        type: ChannelType.GuildVoice,
        parent: categoriaAtivos.id,
        permissionOverwrites: [
          {
            id: guild.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
            deny: [PermissionFlagsBits.Speak]
          }
        ]
      });

      // Dados do evento
      const eventData = {
        id: eventId,
        nome: nome,
        descricao: descricao,
        requisitos: requisitos,
        horario: horario,
        criadorId: interaction.user.id,
        criadorTag: interaction.user.tag,
        canalVozId: canalVoz.id,
        canalTextoId: canalParticipar.id,
        status: 'aguardando', // aguardando, em_andamento, pausado, encerrado
        participantes: new Map(), // userId -> {nick, tempoInicio, tempoTotal, pausado}
        inicioTimestamp: null,
        pausadoGlobal: false,
        trancado: false,
        messageId: null
      };

      // Criar embed do evento
      const embed = this.createEventEmbed(eventData);
      const botoes = this.createEventButtons(eventData, 'aguardando');

      const msg = await canalParticipar.send({
        content: `📢 <@&${guild.roles.cache.find(r => r.name === 'Membro')?.id}> Novo evento criado!`,
        embeds: [embed],
        components: botoes
      });

      eventData.messageId = msg.id;
      global.activeEvents.set(eventId, eventData);

      await interaction.editReply({
        content: `✅ **Evento criado com sucesso!**\n\n🎮 **${nome}**\n🕐 ${horario}\n🔊 Canal: <#${canalVoz.id}>`
      });

      console.log(`⚔️ Evento criado: ${nome} por ${interaction.user.tag}`);

    } catch (error) {
      console.error('❌ Erro ao criar evento:', error);
      await interaction.editReply({
        content: '❌ Erro ao criar evento. Verifique as permissões do bot.'
      });
    }
  }

  // Criar embed do evento
  static createEventEmbed(eventData) {
    const statusEmojis = {
      'aguardando': '⏳',
      'em_andamento': '🔴',
      'pausado': '⏸️',
      'encerrado': '✅'
    };

    const statusTextos = {
      'aguardando': 'Aguardando Início',
      'em_andamento': 'Em Andamento',
      'pausado': 'Pausado',
      'encerrado': 'Encerrado'
    };

    let participantesTexto = '';
    if (eventData.participantes.size === 0) {
      participantesTexto = '*Nenhum participante ainda*';
    } else {
      participantesTexto = Array.from(eventData.participantes.entries())
        .map(([userId, data]) => {
          const pausaIcon = data.pausado ? ' ⏸️' : '';
          return `• ${data.nick}${pausaIcon}`;
        })
        .join('\n');
    }

    const embed = new EmbedBuilder()
      .setTitle(`${statusEmojis[eventData.status]} **${eventData.nome}**`)
      .setDescription(eventData.descricao)
      .setColor(this.getStatusColor(eventData.status))
      .addFields(
        { 
          name: '📋 Informações', 
          value: 
            `**Criador:** <@${eventData.criadorId}>\n` +
            `**Horário:** ${eventData.horario}\n` +
            `**Status:** ${statusTextos[eventData.status]}\n` +
            `**Canal:** <#${eventData.canalVozId}>`,
          inline: false 
        },
        { 
          name: '⚠️ Requisitos', 
          value: eventData.requisitos, 
          inline: false 
        },
        { 
          name: `👥 Participantes (${eventData.participantes.size})`, 
          value: participantesTexto.substring(0, 1024) || 'Nenhum',
          inline: false 
        }
      )
      .setFooter({ 
        text: `ID: ${eventData.id} • Atualizado`, 
        iconURL: 'https://i.imgur.com/JR7K1xC.png' 
      })
      .setTimestamp();

    if (eventData.status === 'em_andamento' && eventData.inicioTimestamp) {
      const duracao = Math.floor((Date.now() - eventData.inicioTimestamp) / 1000 / 60);
      embed.addFields({
        name: '⏱️ Duração',
        value: `${duracao} minutos`,
        inline: true
      });
    }

    return embed;
  }

  // Criar botões do evento baseado no status
  static createEventButtons(eventData, status) {
    const rows = [];

    // Row 1: Ações principais
    const row1 = new ActionRowBuilder();

    if (status === 'aguardando') {
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId(`evt_participar_${eventData.id}`)
          .setLabel('✋ Participar')
          .setStyle(ButtonStyle.Success)
          .setDisabled(eventData.trancado),
        new ButtonBuilder()
          .setCustomId(`evt_iniciar_${eventData.id}`)
          .setLabel('▶️ Iniciar Evento')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`evt_trancar_${eventData.id}`)
          .setLabel(eventData.trancado ? '🔓 Destrancar' : '🔒 Trancar')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`evt_cancelar_${eventData.id}`)
          .setLabel('❌ Cancelar')
          .setStyle(ButtonStyle.Danger)
      );
    } else if (status === 'em_andamento') {
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId(`evt_participar_${eventData.id}`)
          .setLabel('✋ Participar')
          .setStyle(ButtonStyle.Success)
          .setDisabled(eventData.trancado),
        new ButtonBuilder()
          .setCustomId(`evt_pausar_${eventData.id}`)
          .setLabel('⏸️ Pausar')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`evt_pausar_global_${eventData.id}`)
          .setLabel('⏸️ Pausar Evento')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`evt_finalizar_${eventData.id}`)
          .setLabel('🏁 Finalizar')
          .setStyle(ButtonStyle.Danger)
      );
    } else if (status === 'pausado') {
      row1.addComponents(
        new ButtonBuilder()
          .setCustomId(`evt_participar_${eventData.id}`)
          .setLabel('✋ Participar')
          .setStyle(ButtonStyle.Success)
          .setDisabled(eventData.trancado),
        new ButtonBuilder()
          .setCustomId(`evt_pausar_${eventData.id}`)
          .setLabel('⏸️ Pausar')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`evt_retomar_global_${eventData.id}`)
          .setLabel('▶️ Retomar Evento')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`evt_finalizar_${eventData.id}`)
          .setLabel('🏁 Finalizar')
          .setStyle(ButtonStyle.Danger)
      );
    }

    rows.push(row1);
    return rows;
  }

  // Obter cor baseada no status
  static getStatusColor(status) {
    const cores = {
      'aguardando': 0xF39C12,    // Laranja
      'em_andamento': 0xE74C3C,  // Vermelho
      'pausado': 0x95A5A6,       // Cinza
      'encerrado': 0x2ECC71      // Verde
    };
    return cores[status] || 0x95A5A6;
  }

  // Handler: Participar do evento
  static async handleParticipar(interaction, eventId) {
    try {
      const eventData = global.activeEvents.get(eventId);
      if (!eventData) {
        return interaction.reply({ content: '❌ Evento não encontrado!', ephemeral: true });
      }

      if (eventData.trancado) {
        return interaction.reply({ content: '🔒 Este evento está trancado!', ephemeral: true });
      }

      const member = interaction.member;
      const canalVoz = interaction.guild.channels.cache.get(eventData.canalVozId);

      // Verificar se já está participando
      if (eventData.participantes.has(member.id)) {
        // Apenas mover para o canal
        if (member.voice.channel && canalVoz) {
          await member.voice.setChannel(canalVoz.id);
        }
        return interaction.reply({ 
          content: `✅ Você já está no evento! Movido para o canal de voz.`, 
          ephemeral: true 
        });
      }

      // Adicionar participante
      eventData.participantes.set(member.id, {
        nick: member.nickname || member.user.username,
        userId: member.id,
        tempoInicio: eventData.status === 'em_andamento' ? Date.now() : null,
        tempoTotal: 0,
        pausado: false
      });

      // Mover para canal de voz
      if (member.voice.channel && canalVoz) {
        await member.voice.setChannel(canalVoz.id);
      }

      // Atualizar embed
      await this.updateEventPanel(interaction, eventData);

      await interaction.reply({ 
        content: `✅ Você entrou no evento **${eventData.nome}**!`, 
        ephemeral: true 
      });

    } catch (error) {
      console.error('Erro ao participar:', error);
      await interaction.reply({ content: '❌ Erro ao participar do evento.', ephemeral: true });
    }
  }

  // Handler: Iniciar evento
  static async handleIniciar(interaction, eventId) {
    try {
      const eventData = global.activeEvents.get(eventId);
      if (!eventData) {
        return interaction.reply({ content: '❌ Evento não encontrado!', ephemeral: true });
      }

      // Verificar permissão
      const isCriador = interaction.user.id === eventData.criadorId;
      const isStaff = interaction.member.roles.cache.some(r => ['ADM', 'Staff'].includes(r.name));

      if (!isCriador && !isStaff) {
        return interaction.reply({ 
          content: '❌ Apenas o criador ou staff pode iniciar!', 
          ephemeral: true 
        });
      }

      eventData.status = 'em_andamento';
      eventData.inicioTimestamp = Date.now();

      // Iniciar contagem para todos os participantes presentes
      eventData.participantes.forEach(part => {
        if (!part.pausado) {
          part.tempoInicio = Date.now();
        }
      });

      await this.updateEventPanel(interaction, eventData);

      await interaction.reply({ 
        content: '▶️ Evento iniciado! A contagem de participação começou.', 
        ephemeral: true 
      });

    } catch (error) {
      console.error('Erro ao iniciar:', error);
      await interaction.reply({ content: '❌ Erro ao iniciar evento.', ephemeral: true });
    }
  }

  // Handler: Pausar participação individual
  static async handlePausar(interaction, eventId) {
    try {
      const eventData = global.activeEvents.get(eventId);
      if (!eventData) {
        return interaction.reply({ content: '❌ Evento não encontrado!', ephemeral: true });
      }

      const participante = eventData.participantes.get(interaction.user.id);
      if (!participante) {
        return interaction.reply({ content: '❌ Você não está participando deste evento!', ephemeral: true });
      }

      if (participante.pausado) {
        // Retomar
        participante.pausado = false;
        if (eventData.status === 'em_andamento') {
          participante.tempoInicio = Date.now();
        }
        await interaction.reply({ content: '▶️ Sua participação foi retomada!', ephemeral: true });
      } else {
        // Pausar
        participante.pausado = true;
        if (participante.tempoInicio) {
          participante.tempoTotal += Date.now() - participante.tempoInicio;
          participante.tempoInicio = null;
        }
        await interaction.reply({ content: '⏸️ Sua participação foi pausada!', ephemeral: true });
      }

      await this.updateEventPanel(interaction, eventData);

    } catch (error) {
      console.error('Erro ao pausar:', error);
      await interaction.reply({ content: '❌ Erro ao pausar participação.', ephemeral: true });
    }
  }

  // Handler: Pausar/Retomar evento global
  static async handlePausarGlobal(interaction, eventId, pausar) {
    try {
      const eventData = global.activeEvents.get(eventId);
      if (!eventData) {
        return interaction.reply({ content: '❌ Evento não encontrado!', ephemeral: true });
      }

      // Verificar permissão
      const isCriador = interaction.user.id === eventData.criadorId;
      const isStaff = interaction.member.roles.cache.some(r => ['ADM', 'Staff'].includes(r.name));

      if (!isCriador && !isStaff) {
        return interaction.reply({ 
          content: '❌ Apenas o criador ou staff pode pausar/retomar!', 
          ephemeral: true 
        });
      }

      if (pausar) {
        eventData.status = 'pausado';
        // Calcular tempo de todos os participantes ativos
        eventData.participantes.forEach(part => {
          if (!part.pausado && part.tempoInicio) {
            part.tempoTotal += Date.now() - part.tempoInicio;
            part.tempoInicio = null;
          }
        });
        await interaction.reply({ content: '⏸️ Evento pausado globalmente!', ephemeral: true });
      } else {
        eventData.status = 'em_andamento';
        // Retomar contagem para todos não pausados
        eventData.participantes.forEach(part => {
          if (!part.pausado) {
            part.tempoInicio = Date.now();
          }
        });
        await interaction.reply({ content: '▶️ Evento retomado!', ephemeral: true });
      }

      await this.updateEventPanel(interaction, eventData);

    } catch (error) {
      console.error('Erro ao pausar/retomar global:', error);
      await interaction.reply({ content: '❌ Erro ao pausar evento.', ephemeral: true });
    }
  }

  // Handler: Trancar/Destrancar evento
  static async handleTrancar(interaction, eventId) {
    try {
      const eventData = global.activeEvents.get(eventId);
      if (!eventData) {
        return interaction.reply({ content: '❌ Evento não encontrado!', ephemeral: true });
      }

      // Verificar permissão
      const isCriador = interaction.user.id === eventData.criadorId;
      const isStaff = interaction.member.roles.cache.some(r => ['ADM', 'Staff'].includes(r.name));

      if (!isCriador && !isStaff) {
        return interaction.reply({ 
          content: '❌ Apenas o criador ou staff pode trancar!', 
          ephemeral: true 
        });
      }

      eventData.trancado = !eventData.trancado;

      await this.updateEventPanel(interaction, eventData);

      await interaction.reply({ 
        content: eventData.trancado ? '🔒 Evento trancado!' : '🔓 Evento destrancado!', 
        ephemeral: true 
      });

    } catch (error) {
      console.error('Erro ao trancar:', error);
      await interaction.reply({ content: '❌ Erro ao trancar evento.', ephemeral: true });
    }
  }

  // Handler: Cancelar evento
  static async handleCancelar(interaction, eventId) {
    try {
      const eventData = global.activeEvents.get(eventId);
      if (!eventData) {
        return interaction.reply({ content: '❌ Evento não encontrado!', ephemeral: true });
      }

      // Verificar permissão
      const isCriador = interaction.user.id === eventData.criadorId;
      const isStaff = interaction.member.roles.cache.some(r => ['ADM', 'Staff'].includes(r.name));

      if (!isCriador && !isStaff) {
        return interaction.reply({ 
          content: '❌ Apenas o criador ou staff pode cancelar!', 
          ephemeral: true 
        });
      }

      // Deletar canal de voz
      const canalVoz = interaction.guild.channels.cache.get(eventData.canalVozId);
      if (canalVoz) {
        await canalVoz.delete('Evento cancelado');
      }

      // Deletar mensagem do evento
      const canalParticipar = interaction.guild.channels.cache.get(eventData.canalTextoId);
      if (canalParticipar) {
        const msg = await canalParticipar.messages.fetch(eventData.messageId).catch(() => null);
        if (msg) await msg.delete();
      }

      global.activeEvents.delete(eventId);

      await interaction.reply({ 
        content: '❌ Evento cancelado e canal deletado.', 
        ephemeral: true 
      });

    } catch (error) {
      console.error('Erro ao cancelar:', error);
      await interaction.reply({ content: '❌ Erro ao cancelar evento.', ephemeral: true });
    }
  }

  // Handler: Finalizar evento
  static async handleFinalizar(interaction, eventId) {
    try {
      const eventData = global.activeEvents.get(eventId);
      if (!eventData) {
        return interaction.reply({ content: '❌ Evento não encontrado!', ephemeral: true });
      }

      // Verificar permissão
      const isCriador = interaction.user.id === eventData.criadorId;
      const isStaff = interaction.member.roles.cache.some(r => ['ADM', 'Staff'].includes(r.name));

      if (!isCriador && !isStaff) {
        return interaction.reply({ 
          content: '❌ Apenas o criador ou staff pode finalizar!', 
          ephemeral: true 
        });
      }

      // Calcular tempo final dos participantes
      if (eventData.status === 'em_andamento') {
        eventData.participantes.forEach(part => {
          if (!part.pausado && part.tempoInicio) {
            part.tempoTotal += Date.now() - part.tempoInicio;
          }
        });
      }

      // Mover todos para "Aguardando-Evento"
      const canalAguardando = interaction.guild.channels.cache.find(
        c => c.name === '🔊╠Aguardando-Evento'
      );

      const canalVoz = interaction.guild.channels.cache.get(eventData.canalVozId);

      if (canalVoz && canalAguardando) {
        // Mover membros
        for (const [memberId] of eventData.participantes) {
          const member = await interaction.guild.members.fetch(memberId).catch(() => null);
          if (member && member.voice.channelId === canalVoz.id) {
            try {
              await member.voice.setChannel(canalAguardando.id);
            } catch (e) {
              console.log(`Não foi possível mover ${memberId}`);
            }
          }
        }
      }

      // Deletar canal de voz
      if (canalVoz) {
        await canalVoz.delete('Evento finalizado');
      }

      // Criar resumo em canal de eventos encerrados
      await this.createFinishedEventChannel(interaction, eventData);

      // Deletar mensagem original
      const canalParticipar = interaction.guild.channels.cache.get(eventData.canalTextoId);
      if (canalParticipar) {
        const msg = await canalParticipar.messages.fetch(eventData.messageId).catch(() => null);
        if (msg) await msg.delete();
      }

      global.activeEvents.delete(eventId);

      await interaction.reply({ 
        content: '✅ Evento finalizado! Resumo criado em eventos encerrados.', 
        ephemeral: true 
      });

    } catch (error) {
      console.error('Erro ao finalizar:', error);
      await interaction.reply({ content: '❌ Erro ao finalizar evento.', ephemeral: true });
    }
  }

  // Criar canal de texto em eventos encerrados
  static async createFinishedEventChannel(interaction, eventData) {
    try {
      const categoriaEncerrados = interaction.guild.channels.cache.find(
        c => c.name === '📁 EVENTOS ENCERRADOS' && c.type === ChannelType.GuildCategory
      );

      if (!categoriaEncerrados) {
        console.error('Categoria de eventos encerrados não encontrada');
        return;
      }

      // Calcular estatísticas
      let resumoParticipantes = '';
      const participantesOrdenados = Array.from(eventData.participantes.entries())
        .sort((a, b) => b[1].tempoTotal - a[1].tempoTotal);

      participantesOrdenados.forEach(([userId, data], index) => {
        const tempoMinutos = Math.floor(data.tempoTotal / 1000 / 60);
        resumoParticipantes += `${index + 1}. ${data.nick} - ${tempoMinutos}min\n`;
      });

      const canalEncerrado = await interaction.guild.channels.create({
        name: `📁-${eventData.nome.substring(0, 20)}`,
        type: ChannelType.GuildText,
        parent: categoriaEncerrados.id,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            allow: [PermissionFlagsBits.ViewChannel],
            deny: [PermissionFlagsBits.SendMessages]
          }
        ]
      });

      const embedResumo = new EmbedBuilder()
        .setTitle('✅ **EVENTO ENCERRADO**')
        .setDescription(
          `**${eventData.nome}**\n\n` +
          `**Criador:** <@${eventData.criadorId}>\n` +
          `**Horário:** ${eventData.horario}\n` +
          `**Total de Participantes:** ${eventData.participantes.size}\n\n` +
          `**Descrição:**\n${eventData.descricao}`
        )
        .setColor(0x2ECC71)
        .addFields({
          name: '👥 Participação (Tempo)',
          value: resumoParticipantes || 'Nenhum participante',
          inline: false
        })
        .setTimestamp();

      await canalEncerrado.send({ embeds: [embedResumo] });

    } catch (error) {
      console.error('Erro ao criar canal de evento encerrado:', error);
    }
  }

  // Atualizar painel do evento
  static async updateEventPanel(interaction, eventData) {
    try {
      const canal = interaction.guild.channels.cache.get(eventData.canalTextoId);
      if (!canal) return;

      const msg = await canal.messages.fetch(eventData.messageId).catch(() => null);
      if (!msg) return;

      const embed = this.createEventEmbed(eventData);
      const botoes = this.createEventButtons(eventData, eventData.status);

      await msg.edit({
        embeds: [embed],
        components: botoes
      });

    } catch (error) {
      console.error('Erro ao atualizar painel:', error);
    }
  }
}

module.exports = EventHandler;