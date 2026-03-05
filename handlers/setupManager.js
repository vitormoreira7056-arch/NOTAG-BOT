const { 
  ChannelType, 
  PermissionFlagsBits 
} = require('discord.js');

class SetupManager {
  constructor(guild, interaction = null) {
    this.guild = guild;
    this.interaction = interaction;
    this.createdChannels = [];
    this.createdCategories = [];
    this.existingChannels = [];
    this.rolesChecked = [];
    this.deletedChannels = [];
    this.deletedCategories = [];
    this.deletedRoles = [];
    this.errors = [];
  }

  // Estrutura completa de canais e categorias
  getServerStructure() {
    return [
      {
        name: '🛡️ RECRUTAMENTO',
        type: ChannelType.GuildCategory,
        channels: [
          { name: '📋╠registrar', type: ChannelType.GuildText },
          { name: '🎤╠Recrutamento', type: ChannelType.GuildVoice },
          { name: '📅╠agendamentos', type: ChannelType.GuildText }
        ]
      },
      {
        name: '⚙️ CONFIG',
        type: ChannelType.GuildCategory,
        channels: [
          { name: '🔧╠configurações', type: ChannelType.GuildText }
        ]
      },
      {
        name: '💰 BANCO DA GUILDA',
        type: ChannelType.GuildCategory,
        channels: [
          { name: '➕╠criar-evento', type: ChannelType.GuildText },
          { name: '👋╠participar', type: ChannelType.GuildText },
          { name: '🔍╠consultar-saldo', type: ChannelType.GuildText },
          { name: '💰╠venda-de-baú', type: ChannelType.GuildText },
          { name: '📊╠financeiro', type: ChannelType.GuildText },
          { name: '💵╠depósitos', type: ChannelType.GuildText },
          { name: '📜╠logs-banco', type: ChannelType.GuildText },
          { name: '🔊╠Aguardando-Evento', type: ChannelType.GuildVoice }
        ]
      },
      {
        name: '⚔️ EVENTOS ATIVOS',
        type: ChannelType.GuildCategory,
        channels: []
      },
      {
        name: '📁 EVENTOS ENCERRADOS',
        type: ChannelType.GuildCategory,
        channels: []
      },
      {
        name: '👥 GESTÃO DE MEMBROS',
        type: ChannelType.GuildCategory,
        channels: [
          { name: '📨╠solicitação-registro', type: ChannelType.GuildText },
          { name: '🚪╠saída-membros', type: ChannelType.GuildText },
          { name: '📋╠lista-membros', type: ChannelType.GuildText }
        ]
      },
      {
        name: '👑 GESTÃO DE GUILDA',
        type: ChannelType.GuildCategory,
        channels: [
          { name: '📊╠painel-de-eventos', type: ChannelType.GuildText },
          { name: '🏦╠saldo-guilda', type: ChannelType.GuildText }
        ]
      },
      {
        name: '🎓 ALBION ACADEMY',
        type: ChannelType.GuildCategory,
        channels: [
          { name: '👤╠perfil', type: ChannelType.GuildText },
          { name: '⭐╠xp-event', type: ChannelType.GuildText },
          { name: '📜╠log-xp', type: ChannelType.GuildText },
          { name: '🔮╠orb-xp', type: ChannelType.GuildText },
          { name: '📊╠painel-xp', type: ChannelType.GuildText }
        ]
      }
    ];
  }

  // Cargos necessários atualizados
  getRequiredRoles() {
    return [
      'ADM',
      'Staff', 
      'Caller',
      'tesoureiro',
      'Recrutador',
      'Membro',
      'Convidado',
      'Aliança'
    ];
  }

  async install() {
    console.log('🏗️ Iniciando instalação da estrutura...');

    // Verificar/criar cargos primeiro
    await this.setupRoles();

    // Criar estrutura de canais
    const structure = this.getServerStructure();

    for (const categoryData of structure) {
      try {
        // Criar ou pegar categoria
        let category = this.guild.channels.cache.find(
          c => c.name === categoryData.name && c.type === ChannelType.GuildCategory
        );

        if (!category) {
          category = await this.guild.channels.create({
            name: categoryData.name,
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
              {
                id: this.guild.id,
                allow: [PermissionFlagsBits.ViewChannel],
                deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect]
              }
            ]
          });
          this.createdCategories.push(categoryData.name);
          console.log(`✅ Categoria criada: ${categoryData.name}`);
        } else {
          this.existingChannels.push(categoryData.name);
          console.log(`⚠️ Categoria já existe: ${categoryData.name}`);
        }

        // Criar canais dentro da categoria
        for (const channelData of categoryData.channels) {
          await this.createChannel(channelData, category);
        }

      } catch (error) {
        console.error(`❌ Erro ao criar categoria ${categoryData.name}:`, error);
        this.errors.push(`${categoryData.name}: ${error.message}`);
      }
    }

    return {
      success: true,
      message: `Estrutura instalada com sucesso!\n🆕 ${this.createdChannels.length} canais criados\n📁 ${this.createdCategories.length} categorias criadas\n🎭 ${this.rolesChecked.length} cargos verificados`,
      createdChannels: this.createdChannels,
      createdCategories: this.createdCategories,
      existingChannels: this.existingChannels,
      rolesChecked: this.rolesChecked,
      errors: this.errors
    };
  }

  async createChannel(channelData, category) {
    try {
      const existingChannel = this.guild.channels.cache.find(
        c => c.name === channelData.name && c.parentId === category.id
      );

      if (existingChannel) {
        this.existingChannels.push(channelData.name);
        return existingChannel;
      }

      const channel = await this.guild.channels.create({
        name: channelData.name,
        type: channelData.type,
        parent: category.id,
        permissionOverwrites: this.getChannelPermissions(channelData.name)
      });

      this.createdChannels.push(channelData.name);
      console.log(`✅ Canal criado: ${channelData.name}`);
      return channel;

    } catch (error) {
      console.error(`❌ Erro ao criar canal ${channelData.name}:`, error);
      this.errors.push(`${channelData.name}: ${error.message}`);
      throw error;
    }
  }

  getChannelPermissions(channelName) {
    const permissions = [];

    // Permissão base para @everyone (Convidado)
    permissions.push({
      id: this.guild.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages]
    });

    // Cargos específicos
    const admRole = this.guild.roles.cache.find(r => r.name === 'ADM');
    const staffRole = this.guild.roles.cache.find(r => r.name === 'Staff');
    const tesoureiroRole = this.guild.roles.cache.find(r => r.name === 'tesoureiro');
    const recrutadorRole = this.guild.roles.cache.find(r => r.name === 'Recrutador');
    const membroRole = this.guild.roles.cache.find(r => r.name === 'Membro');

    // ADM tem acesso total em todos os canais
    if (admRole) {
      permissions.push({
        id: admRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel, 
          PermissionFlagsBits.SendMessages, 
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak
        ]
      });
    }

    // Staff tem acesso gerencial na maioria dos canais
    if (staffRole) {
      permissions.push({
        id: staffRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel, 
          PermissionFlagsBits.SendMessages, 
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak
        ]
      });
    }

    // Permissões específicas por canal

    // Canal de registro: Membros podem ver e escrever (para usar botões)
    if (channelName.includes('registrar')) {
      if (membroRole) {
        permissions.push({
          id: membroRole.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
        });
      }
      // Remover deny SendMessages do everyone neste canal específico
      const everyonePerms = permissions.find(p => p.id === this.guild.id);
      if (everyonePerms) {
        everyonePerms.deny = everyonePerms.deny.filter(d => d !== PermissionFlagsBits.SendMessages);
        everyonePerms.allow.push(PermissionFlagsBits.SendMessages);
      }
    }

    // Canal de solicitação de registro: Recrutadores e ADMs podem gerenciar
    if (channelName.includes('solicitação-registro')) {
      if (recrutadorRole) {
        permissions.push({
          id: recrutadorRole.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages]
        });
      }
      // Membros podem ver mas não escrever
      if (membroRole) {
        permissions.push({
          id: membroRole.id,
          allow: [PermissionFlagsBits.ViewChannel],
          deny: [PermissionFlagsBits.SendMessages]
        });
      }
    }

    // Canais financeiros: Tesoureiro tem acesso especial
    if (channelName.includes('financeiro') || 
        channelName.includes('depósitos') || 
        channelName.includes('logs-banco') ||
        channelName.includes('saldo-guilda')) {
      if (tesoureiroRole) {
        permissions.push({
          id: tesoureiroRole.id,
          allow: [
            PermissionFlagsBits.ViewChannel, 
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageMessages
          ]
        });
      }
    }

    return permissions;
  }

  async setupRoles() {
    const requiredRoles = this.getRequiredRoles();

    for (const roleName of requiredRoles) {
      try {
        const existingRole = this.guild.roles.cache.find(r => r.name === roleName);
        if (!existingRole) {
          const newRole = await this.guild.roles.create({
            name: roleName,
            color: this.getRoleColor(roleName),
            permissions: this.getRolePermissions(roleName),
            reason: 'Setup inicial do bot'
          });

          this.rolesChecked.push(`${roleName} (novo)`);
          console.log(`✅ Cargo criado: ${roleName}`);
        } else {
          this.rolesChecked.push(`${roleName} (existente)`);
          console.log(`⚠️ Cargo já existe: ${roleName}`);
        }
      } catch (error) {
        console.error(`❌ Erro ao criar cargo ${roleName}:`, error);
        this.errors.push(`Cargo ${roleName}: ${error.message}`);
      }
    }
  }

  getRoleColor(roleName) {
    const colors = {
      'ADM': 0xE74C3C,           // Vermelho (Admin)
      'Staff': 0x9B59B6,         // Roxo (Moderação)
      'Caller': 0xF1C40F,        // Amarelo/Ouro (Líder de evento)
      'tesoureiro': 0x2ECC71,    // Verde (Dinheiro/tesouro)
      'Recrutador': 0x3498DB,    // Azul (Recrutamento)
      'Membro': 0x1ABC9C,        // Verde água (Membro oficial)
      'Convidado': 0x95A5A6,     // Cinza (Visitante/Novo)
      'Aliança': 0xE67E22        // Laranja (Aliados)
    };
    return colors[roleName] || 0xFFFFFF;
  }

  getRolePermissions(roleName) {
    // Permissões base para cargos específicos
    switch(roleName) {
      case 'ADM':
        return [PermissionFlagsBits.Administrator];
      case 'Staff':
        return [
          PermissionFlagsBits.KickMembers,
          PermissionFlagsBits.BanMembers,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ViewAuditLog
        ];
      case 'tesoureiro':
        return [
          PermissionFlagsBits.ManageMessages // Para gerenciar canais financeiros
        ];
      case 'Recrutador':
        return [
          PermissionFlagsBits.ManageMessages // Para aprovar registros
        ];
      default:
        return [];
    }
  }

  async uninstall() {
    console.log('🗑️ Iniciando desinstalação completa...');

    // 1. Deletar canais primeiro
    const structure = this.getServerStructure();
    const channelsToDelete = [];
    const categoriesToDelete = [];

    // Coletar todos os canais e categorias criados pelo bot
    for (const categoryData of structure) {
      const category = this.guild.channels.cache.find(
        c => c.name === categoryData.name && c.type === ChannelType.GuildCategory
      );
      if (category) {
        categoriesToDelete.push(category);

        // Coletar canais da categoria
        for (const channelData of categoryData.channels) {
          const channel = this.guild.channels.cache.find(
            c => c.name === channelData.name && c.parentId === category.id
          );
          if (channel) {
            channelsToDelete.push(channel);
          }
        }
      }
    }

    // Deletar canais
    for (const channel of channelsToDelete) {
      try {
        await channel.delete('Desinstalação do bot');
        this.deletedChannels.push(channel.name);
        console.log(`🗑️ Canal deletado: ${channel.name}`);
      } catch (error) {
        console.error(`❌ Erro ao deletar canal ${channel.name}:`, error);
        this.errors.push(`Canal ${channel.name}: ${error.message}`);
      }
    }

    // Deletar categorias
    for (const category of categoriesToDelete) {
      try {
        await category.delete('Desinstalação do bot');
        this.deletedCategories.push(category.name);
        console.log(`🗑️ Categoria deletada: ${category.name}`);
      } catch (error) {
        console.error(`❌ Erro ao deletar categoria ${category.name}:`, error);
        this.errors.push(`Categoria ${category.name}: ${error.message}`);
      }
    }

    // 2. Deletar cargos
    const rolesToDelete = this.getRequiredRoles();

    for (const roleName of rolesToDelete) {
      try {
        const role = this.guild.roles.cache.find(r => r.name === roleName);

        if (role) {
          // Verificar se não é o cargo @everyone (proteção extra)
          if (role.id === this.guild.id) {
            console.log(`⏭️ Pulando cargo @everyone`);
            continue;
          }

          await role.delete('Desinstalação do bot');
          this.deletedRoles.push(roleName);
          console.log(`🗑️ Cargo deletado: ${roleName}`);
        } else {
          console.log(`⚠️ Cargo não encontrado: ${roleName}`);
        }
      } catch (error) {
        console.error(`❌ Erro ao deletar cargo ${roleName}:`, error);
        this.errors.push(`Cargo ${roleName}: ${error.message}`);
      }
    }

    return {
      success: this.errors.length === 0,
      message: `Desinstalação concluída!\n🗑️ ${this.deletedChannels.length} canais removidos\n📁 ${this.deletedCategories.length} categorias removidas\n🎭 ${this.deletedRoles.length} cargos removidos`,
      deletedChannels: this.deletedChannels,
      deletedCategories: this.deletedCategories,
      deletedRoles: this.deletedRoles,
      errors: this.errors
    };
  }
}

module.exports = SetupManager;