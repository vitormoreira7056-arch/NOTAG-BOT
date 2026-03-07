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
    this.activeEvents = new Map();
  }

  static initialize() {
    if (!global.activeEvents) global.activeEvents = new Map();
  }

  static async createEvent(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const nome = interaction.fields.getTextInputValue('evt_nome');
      const descricao = interaction.fields.getTextInputValue('evt_descricao');
      const requisitos = interaction.fields.getTextInputValue('evt_requisitos') || 'Nenhum';
      const horario = interaction.fields.getTextInputValue('evt_horario');

      const guild = interaction.guild;
      const eventId = `event_${Date.now()}_${interaction.user.id}`;

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
        status: 'aguardando',
        participantes: new Map(),
        inicioTimestamp: null,
        pausadoGlobal: false,
        trancado: false,
        messageId: null
      };

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

  static createEventEmbed(eventData) {
    const statusEmojis = {
      'aguardando': '⏳',
      'em_andamento': '🔴',
      'pausado': '⏸️',
      'encerrado': '✅'
    };

    const statusTextos = {
      'aguardando': 'Aguardando Início',
      'em_andamento': '🔥 Em Andamento',
      'pausado': '⏸️ Pausado Globalmente',
      'encerrado': '✅ Encerrado'
    };

    let participantesTexto = '';
    if (eventData.participantes.size === 0) {
      participantesTexto = '```diff\n- Nenhum participante ainda\n```';
    } else {
      const lista = Array.from(eventData.participantes.entries())
        .map(([userId, data]) => {
          const pausaIcon = data.pausado ? ' ⏸️' : ' 🟢';
          const tempo = data.tempoTotal > 0 ? ` (${Math.floor(data.tempoTotal / 1000 / 60)}min)` : '';
          return `${pausaIcon} ${data.nick}${tempo}`;
        })
        .join('\n');
      participantesTexto = '```yaml\n' + lista + '\n```';
    }

    const embed = new EmbedBuilder()
      .setTitle(`${statusEmojis[eventData.status]} ┃ ${eventData.nome}`)
      .setDescription(
        `> ${eventData.descricao}\n\n` +
        `**👤 Criador:** <@${eventData.criadorId}>\n` +
        `**🕐 Horário:** \`${eventData.horario}\`\n` +
        `**📊 Status:** ${statusTextos[eventData.status]}\n` +
        `**🔊 Canal:** <#${eventData.canalVozId}>`
      )
      .setColor(this.getStatusColor(eventData.status))
      .addFields(
        { 
          name: '⚠️ Requisitos', 
          value: `\`\`\`${eventData.requisitos}\`\`\``, 
          inline: false 
        },
        { 
          name: `👥 Participantes (${eventData.participantes.size}) ${eventData.trancado ? '🔒' : ''}`, 
          value: participantesTexto,
          inline: false 
        }
      )
      .setFooter({ 
        text: `ID: ${eventData.id} • Use os botões abaixo`, 
        iconURL: 'https://cdn.discordapp.com/emojis/1051892919120793710.webp?size=96' 
      })
      .setTimestamp();

    if (eventData.status === 'em_andamento' && eventData.inicioTimestamp) {
      const duracao = Math.floor((Date.now() - eventData.inicioTimestamp) / 1000 / 60);
      embed.addFields({
        name: '⏱️ Tempo Decorrido',
        value: `\`${duracao}\` minutos`,
        inline: true
      });
    }

    if (eventData.status === 'pausado') {
      embed.addFields({
        name: '⏸️ Pausado',
        value: 'O evento está pausado globalmente',
        inline: true
      });
    }

    return embed;
  }

  // 🎨 SISTEMA DE BOTÕES MODERNIZADO
  static createEventButtons(eventData, status) {
    const rows = [];
    const isStaffOrCreator = (interaction) => {
      return interaction.user.id === eventData.criadorId || 
             interaction.member.roles.cache.some(r => ['ADM', 'Staff'].includes(r.name));
    };

    // ROW 1: Ações de Participação (Todos podem usar)
    const rowParticipacao = new ActionRowBuilder();

    if (status === 'aguardando' || status === 'em_andamento' || status === 'pausado') {
      // Botão Participar - Sempre visível se evento não estiver trancado
      rowParticipacao.addComponents(
        new ButtonBuilder()
          .setCustomId(`evt_participar_${eventData.id}`)
          .setLabel(eventData.trancado ? '🔒 Evento Trancado' : '✋ Entrar no Evento')
          .setStyle(eventData.trancado ? ButtonStyle.Secondary : ButtonStyle.Success)
          .setEmoji(eventData.trancado ? '🔒' : '🎮')
          .setDisabled(eventData.trancado || status === 'encerrado')
      );

      // Botão Pausar Individual (só aparece se estiver participando)
      // Nota: Este botão é dinâmico, mas aqui colocamos o base
      if (status === 'em_andamento' || status === 'pausado') {
        rowParticipacao.addComponents(
          new ButtonBuilder()
            .setCustomId(`evt_pausar_${eventData.id}`)
            .setLabel('⏸️ Minha Participação')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⏸️')
        );
      }
    }

    if (rowParticipacao.components.length > 0) {
      rows.push(rowParticipacao);
    }

    // ROW 2: Controles do Evento (Apenas Criador/Staff)
    const rowControles = new ActionRowBuilder();

    if (status === 'aguardando') {
      rowControles.addComponents(
        new ButtonBuilder()
          .setCustomId(`evt_iniciar_${eventData.id}`)
          .setLabel('▶️ Iniciar Evento')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🚀'),
        new ButtonBuilder()
          .setCustomId(`evt_trancar_${eventData.id}`)
          .setLabel(eventData.trancado ? '🔓 Destrancar' : '🔒 Trancar')
          .setStyle(eventData.trancado ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setEmoji(eventData.trancado ? '🔓' : '🔒'),
        new ButtonBuilder()
          .setCustomId(`evt_cancelar_${eventData.id}`)
          .setLabel('❌ Cancelar')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️')
      );
    } else if (status === 'em_andamento') {
      // 🎯 CORREÇÃO: Adicionado botão Trancar aqui!
      rowControles.addComponents(
        new ButtonBuilder()
          .setCustomId(`evt_pausar_global_${eventData.id}`)
          .setLabel('⏸️ Pausar Evento')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('⏸️'),
        new ButtonBuilder()
          .setCustomId(`evt_trancar_${eventData.id}`)
          .setLabel(eventData.trancado ? '🔓 Destrancar' : '🔒 Trancar')
          .setStyle(eventData.trancado ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setEmoji(eventData.trancado ? '🔓' : '🔒'),
        new ButtonBuilder()
          .setCustomId(`evt_finalizar_${eventData.id}`)
          .setLabel('🏁 Finalizar')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('✅')
      );
    } else if (status === 'pausado') {
      rowControles.addComponents(
        new ButtonBuilder()
          .setCustomId(`evt_retomar_global_${eventData.id}`)
          .setLabel('▶️ Retomar Evento')
          .setStyle(ButtonStyle.Success)
          .setEmoji('▶️'),
        new ButtonBuilder()
          .setCustomId(`evt_trancar_${eventData.id}`)
          .setLabel(eventData.trancado ? '🔓 Destrancar' : '🔒 Trancar')
          .setStyle(eventData.trancado ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setEmoji(eventData.trancado ? '🔓' : '🔒'),
        new ButtonBuilder()
          .setCustomId(`evt_finalizar_${eventData.id}`)
          .setLabel('🏁 Finalizar')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('✅')
      );
    }

    if (rowControles.components.length > 0) {
      rows.push(rowControles);
    }

    // ROW 3: Informações extras (opcional)
    if (status !== 'encerrado') {
      const rowInfo = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`evt_info_${eventData.id}`)
          .setLabel('📊 Ver Meu Tempo')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⏱️')
          .setDisabled(true) // Por enquanto desabilitado, pode implementar depois
      );
      // rows.push(rowInfo); // Descomente quando implementar
    }

    return rows;
  }

  // 🎨 CORREÇÃO: Atualizar botões dinamicamente baseado no estado do participante
  static async updateEventPanel(interaction, eventData, userId = null) {
    try {
      const canal = interaction.guild.channels.cache.get(eventData.canalTextoId);
      if (!canal) return;

      const msg = await canal.messages.fetch(eventData.messageId).catch(() => null);
      if (!msg) return;

      const embed = this.createEventEmbed(eventData);

      // Se tem userId, verifica se esse usuário específico está pausado para atualizar o botão dele
      // Na prática, Discord não permite botões personalizados por usuário, então mantemos o texto genérico

      const botoes = this.createEventButtons(eventData, eventData.status);

      await msg.edit({
        embeds: [embed],
        components: botoes
      });

    } catch (error) {
      console.error('Erro ao atualizar painel:', error);
    }
  }

  static getStatusColor(status) {
    const cores = {
      'aguardando': 0x3498DB,    // Azul
      'em_andamento': 0xE74C3C,  // Vermelho
      'pausado': 0xF39C12,       // Laranja
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
        return interaction.reply({ 
          content: '🔒 Este evento está trancado! Apenas membros já participantes podem interagir.', 
          ephemeral: true 
        });
      }

      const member = interaction.member;
      const canalVoz = interaction.guild.channels.cache.get(eventData.canalVozId);

      // Verificar se já está participando
      if (eventData.participantes.has(member.id)) {
        // Apenas mover para o canal
        if (member.voice.channel && canalVoz) {
          try {
            await member.voice.setChannel(canalVoz.id);
          } catch (e) {
            console.log('Não foi possível mover usuário:', e.message);
          }
        }

        // Se o evento já começou e ele não está com tempo iniciado, inicia agora
        const participante = eventData.participantes.get(member.id);
        if (eventData.status === 'em_andamento' && !participante.pausado && !participante.tempoInicio) {
          participante.tempoInicio = Date.now();
        }

        return interaction.reply({ 
          content: `✅ Você já está no evento! ${eventData.status === 'em_andamento' ? 'Sua participação está sendo contada!' : ''}`, 
          ephemeral: true 
        });
      }

      // Adicionar novo participante
      eventData.participantes.set(member.id, {
        nick: member.nickname || member.user.username,
        userId: member.id,
        tempoInicio: eventData.status === 'em_andamento' ? Date.now() : null,
        tempoTotal: 0,
        pausado: false
      });

      // Mover para canal de voz
      if (member.voice.channel && canalVoz) {
        try {
          await member.voice.setChannel(canalVoz.id);
        } catch (e) {
          console.log('Não foi possível mover usuário:', e.message);
        }
      }

      await this.updateEventPanel(interaction, eventData);

      const mensagem = eventData.status === 'em_andamento' 
        ? `🎮 Você entrou no evento **${eventData.nome}**!\n⏱️ Sua participação começou a ser contada agora!`
        : `✋ Você entrou na lista de participantes do evento **${eventData.nome}**!\n⏳ Aguarde o início do evento para começar a contagem.`;

      await interaction.reply({ 
        content: mensagem, 
        ephemeral: true 
      });

    } catch (error) {
      console.error('Erro ao participar:', error);
      await interaction.reply({ content: '❌ Erro ao participar do evento.', ephemeral: true });
    }
  }

  // 🎯 CORREÇÃO: Handler de Pausar com lógica dinâmica
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
        // RETOMAR PARTICIPAÇÃO
        participante.pausado = false;
        if (eventData.status === 'em_andamento') {
          participante.tempoInicio = Date.now();
        }

        await this.updateEventPanel(interaction, eventData);

        // Atualizar a mensagem do botão na resposta (se possível)
        await interaction.reply({ 
          content: '▶️ **Participação retomada!**\nSua contagem de tempo voltou a contar.', 
          ephemeral: true 
        });

      } else {
        // PAUSAR PARTICIPAÇÃO
        participante.pausado = true;
        if (participante.tempoInicio) {
          participante.tempoTotal += Date.now() - participante.tempoInicio;
          participante.tempoInicio = null;
        }

        await this.updateEventPanel(interaction, eventData);

        await interaction.reply({ 
          content: '⏸️ **Participação pausada!**\nSua contagem de tempo foi pausada. Clique novamente para retomar.', 
          ephemeral: true 
        });
      }

    } catch (error) {
      console.error('Erro ao pausar:', error);
      await interaction.reply({ content: '❌ Erro ao pausar participação.', ephemeral: true });
    }
  }

  static async handleIniciar(interaction, eventId) {
    try {
      const eventData = global.activeEvents.get(eventId);
      if (!eventData) {
        return interaction.reply({ content: '❌ Evento não encontrado!', ephemeral: true });
      }

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
        content: '🚀 **Evento iniciado!**\nA contagem de participação começou para todos os participantes!', 
        ephemeral: true 
      });

    } catch (error) {
      console.error('Erro ao iniciar:', error);
      await interaction.reply({ content: '❌ Erro ao iniciar evento.', ephemeral: true });
    }
  }

  static async handlePausarGlobal(interaction, eventId, pausar) {
    try {
      const eventData = global.activeEvents.get(eventId);
      if (!eventData) {
        return interaction.reply({ content: '❌ Evento não encontrado!', ephemeral: true });
      }

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
        eventData.pausadoGlobal = true;
        // Calcular tempo de todos os participantes ativos
        eventData.participantes.forEach(part => {
          if (!part.pausado && part.tempoInicio) {
            part.tempoTotal += Date.now() - part.tempoInicio;
            part.tempoInicio = null;
          }
        });
        await interaction.reply({ content: '⏸️ Evento pausado globalmente! Todos os timers foram pausados.', ephemeral: true });
      } else {
        eventData.status = 'em_andamento';
        eventData.pausadoGlobal = false;
        // Retomar contagem para todos não pausados
        eventData.participantes.forEach(part => {
          if (!part.pausado) {
            part.tempoInicio = Date.now();
          }
        });
        await interaction.reply({ content: '▶️ Evento retomado! Os timers voltaram a contar!', ephemeral: true });
      }

      await this.updateEventPanel(interaction, eventData);

    } catch (error) {
      console.error('Erro ao pausar/retomar global:', error);
      await interaction.reply({ content: '❌ Erro ao pausar evento.', ephemeral: true });
    }
  }

  static async handleTrancar(interaction, eventId) {
    try {
      const eventData = global.activeEvents.get(eventId);
      if (!eventData) {
        return interaction.reply({ content: '❌ Evento não encontrado!', ephemeral: true });
      }

      const isCriador = interaction.user.id === eventData.criadorId;
      const isStaff = interaction.member.roles.cache.some(r => ['ADM', 'Staff'].includes(r.name));

      if (!isCriador && !isStaff) {
        return interaction.reply({ 
          content: '❌ Apenas o criador ou staff pode trancar/destrancar!', 
          ephemeral: true 
        });
      }

      eventData.trancado = !eventData.trancado;

      await this.updateEventPanel(interaction, eventData);

      await interaction.reply({ 
        content: eventData.trancado 
          ? '🔒 **Evento trancado!** Novos participantes não poderão entrar.' 
          : '🔓 **Evento destrancado!** Novos participantes podem entrar agora.', 
        ephemeral: true 
      });

    } catch (error) {
      console.error('Erro ao trancar:', error);
      await interaction.reply({ content: '❌ Erro ao trancar evento.', ephemeral: true });
    }
  }

  static async handleCancelar(interaction, eventId) {
    try {
      const eventData = global.activeEvents.get(eventId);
      if (!eventData) {
        return interaction.reply({ content: '❌ Evento não encontrado!', ephemeral: true });
      }

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
        content: '🗑️ **Evento cancelado** e todos os recursos foram liberados.', 
        ephemeral: true 
      });

    } catch (error) {
      console.error('Erro ao cancelar:', error);
      await interaction.reply({ content: '❌ Erro ao cancelar evento.', ephemeral: true });
    }
  }

  static async handleFinalizar(interaction, eventId) {
    try {
      const eventData = global.activeEvents.get(eventId);
      if (!eventData) {
        return interaction.reply({ content: '❌ Evento não encontrado!', ephemeral: true });
      }

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
        content: '✅ **Evento finalizado com sucesso!**\n📊 Resumo criado em eventos encerrados.', 
        ephemeral: true 
      });

    } catch (error) {
      console.error('Erro ao finalizar:', error);
      await interaction.reply({ content: '❌ Erro ao finalizar evento.', ephemeral: true });
    }
  }

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
        resumoParticipantes += `${index + 1}. ${data.nick} — \`${tempoMinutos} min\`\n`;
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

      const tempoTotalEvento = eventData.inicioTimestamp 
        ? Math.floor((Date.now() - eventData.inicioTimestamp) / 1000 / 60)
        : 0;

      const embedResumo = new EmbedBuilder()
        .setTitle('✅ ┃ EVENTO ENCERRADO')
        .setDescription(
          `## ${eventData.nome}\n\n` +
          `**👤 Criador:** <@${eventData.criadorId}>\n` +
          `**🕐 Horário:** ${eventData.horario}\n` +
          `**⏱️ Duração Total:** \`${tempoTotalEvento}\` minutos\n` +
          `**👥 Total de Participantes:** \`${eventData.participantes.size}\``
        )
        .setColor(0x2ECC71)
        .addFields(
          {
            name: '📝 Descrição',
            value: eventData.descricao,
            inline: false
          },
          {
            name: '🏆 Ranking de Participação',
            value: resumoParticipantes || 'Nenhum participante',
            inline: false
          }
        )
        .setTimestamp();

      await canalEncerrado.send({ embeds: [embedResumo] });

    } catch (error) {
      console.error('Erro ao criar canal de evento encerrado:', error);
    }
  }
}

module.exports = EventHandler;