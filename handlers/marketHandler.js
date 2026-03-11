const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require('discord.js');
const MarketApi = require('./albionMarketApi');

/**
* MarketHandler - Sistema de Pesquisa de Preços do Albion Online
* Painel interativo com busca por nome, tier, encantamento e qualidade
*/
class MarketHandler {
  constructor() {
      // Armazenar buscas em andamento
      this.activeSearches = new Map();
      this.searchResults = new Map();

      // Mapeamento de tiers
      this.tiers = [
          { value: '4', label: 'T4', emoji: '🟢' },
          { value: '5', label: 'T5', emoji: '🔵' },
          { value: '6', label: 'T6', emoji: '🟣' },
          { value: '7', label: 'T7', emoji: '🟡' },
          { value: '8', label: 'T8', emoji: '🔴' }
      ];

      // Mapeamento de encantamentos
      this.enchants = [
          { value: '0', label: 'Normal (.0)', emoji: '⚪' },
          { value: '1', label: 'Encantado .1', emoji: '🟢' },
          { value: '2', label: 'Encantado .2', emoji: '🔵' },
          { value: '3', label: 'Encantado .3', emoji: '🟣' },
          { value: '4', label: 'Encantado .4', emoji: '🟡' }
      ];

      // Mapeamento de qualidades
      this.qualities = [
          { value: '1', label: 'Normal', emoji: '⚪' },
          { value: '2', label: 'Bom', emoji: '🟢' },
          { value: '3', label: 'Notável', emoji: '🔵' },
          { value: '4', label: 'Excelente', emoji: '🟣' },
          { value: '5', label: 'Obra-prima', emoji: '🟡' }
      ];
  }

  /**
   * Envia o painel principal do mercado
   */
  async sendPanel(channel) {
      try {
          const embed = new EmbedBuilder()
              .setTitle('🛒 **MERCADO ALBION**')
              .setDescription(
                  'Pesquise preços de itens em tempo real nas cidades do Albion Online.\n\n' +
                  '**Como usar:**\n' +
                  '1️⃣ Clique em **🔍 Pesquisar Item**\n' +
                  '2️⃣ Digite o nome do item\n' +
                  '3️⃣ Selecione o Tier, Encantamento e Qualidade\n' +
                  '4️⃣ Veja os preços em todas as cidades\n\n' +
                  '_Dados fornecidos por Albion Online Data Project_'
              )
              .setColor(0xF39C12)
              .setThumbnail('https://render.albiononline.com/v1/item/T4_BAG.png')
              .addFields(
                  {
                      name: '📊 **Funcionalidades**',
                      value: '• Preços em tempo real\n• Comparação entre cidades\n• Histórico de preços\n• Melhor preço de venda/compra',
                      inline: true
                  },
                  {
                      name: '⚡ **Dicas**',
                      value: '• Use nomes em inglês para melhor resultado\n• Black Market mostra preços de venda para o jogo\n• Qualidade afeta apenas itens de armadura/armas',
                      inline: true
                  }
              )
              .setFooter({ text: 'Sistema de Mercado • NOTAG Bot' })
              .setTimestamp();

          const buttons = new ActionRowBuilder()
              .addComponents(
                  new ButtonBuilder()
                      .setCustomId('market_search_item')
                      .setLabel('🔍 Pesquisar Item')
                      .setStyle(ButtonStyle.Primary),
                  new ButtonBuilder()
                      .setCustomId('market_search_history')
                      .setLabel('📜 Histórico')
                      .setStyle(ButtonStyle.Secondary),
                  new ButtonBuilder()
                      .setCustomId('market_update_cache')
                      .setLabel('🔄 Atualizar Cache')
                      .setStyle(ButtonStyle.Secondary),
                  new ButtonBuilder()
                      .setCustomId('market_help')
                      .setLabel('❓ Ajuda')
                      .setStyle(ButtonStyle.Success)
              );

          await channel.send({
              embeds: [embed],
              components: [buttons]
          });

          console.log(`[MarketHandler] Painel enviado em ${channel.name}`);
      } catch (error) {
          console.error('[MarketHandler] Erro ao enviar painel:', error);
          throw error;
      }
  }

  /**
   * Inicia o fluxo de pesquisa - abre modal para nome do item
   */
  async handleSearchButton(interaction) {
      try {
          const modal = new ModalBuilder()
              .setCustomId('market_modal_search')
              .setTitle('🔍 Pesquisar Item no Mercado');

          const itemInput = new TextInputBuilder()
              .setCustomId('market_item_name')
              .setLabel('Nome do Item (em inglês)')
              .setPlaceholder('Ex: T4_BAG, Adepts Staff, Cape...')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(2)
              .setMaxLength(50);

          modal.addComponents(new ActionRowBuilder().addComponents(itemInput));

          await interaction.showModal(modal);

      } catch (error) {
          console.error('[MarketHandler] Erro ao abrir modal:', error);
          await interaction.reply({
              content: '❌ Erro ao iniciar pesquisa. Tente novamente.',
              ephemeral: true
          });
      }
  }

  /**
   * Processa a pesquisa após o usuário digitar o nome
   */
  async processSearchModal(interaction) {
      try {
          const itemName = interaction.fields.getTextInputValue('market_item_name').trim();

          // Buscar itens no cache
          const results = MarketApi.searchItems(itemName, 15);

          if (results.length === 0) {
              await interaction.reply({
                  content: `❌ Nenhum item encontrado para "**${itemName}**".\n\nTente usar o nome em inglês ou parte do nome.\nExemplos: "bag", "sword", "cape", "T4_"`,
                  ephemeral: true
              });
              return;
          }

          // Se encontrou apenas 1 resultado, ir direto para seleção de filtros
          if (results.length === 1) {
              await this.showFiltersSelect(interaction, results[0]);
              return;
          }

          // Mostrar resultados para seleção
          await this.showResultsSelect(interaction, results);

      } catch (error) {
          console.error('[MarketHandler] Erro ao processar pesquisa:', error);
          await interaction.reply({
              content: '❌ Erro ao processar pesquisa.',
              ephemeral: true
          });
      }
  }

  /**
   * Mostra select menu com resultados da busca
   */
  async showResultsSelect(interaction, results) {
      try {
          const options = results.slice(0, 25).map(item => {
              return new StringSelectMenuOptionBuilder()
                  .setLabel(item.name.substring(0, 100))
                  .setValue(item.id)
                  .setDescription(`${item.tier || 'N/A'} • ${item.category}`)
                  .setEmoji(this.getTierEmoji(item.tier));
          });

          const selectMenu = new StringSelectMenuBuilder()
              .setCustomId('market_select_item')
              .setPlaceholder('Selecione um item da lista...')
              .addOptions(options);

          const row = new ActionRowBuilder().addComponents(selectMenu);

          const embed = new EmbedBuilder()
              .setTitle('📋 Resultados da Pesquisa')
              .setDescription(`Foram encontrados ${results.length} itens. Selecione um para continuar:`)
              .setColor(0x3498DB);

          await interaction.reply({
              embeds: [embed],
              components: [row],
              ephemeral: true
          });

      } catch (error) {
          console.error('[MarketHandler] Erro ao mostrar resultados:', error);
          throw error;
      }
  }

  /**
   * Mostra seleção de filtros (Tier, Encantamento, Qualidade)
   */
  async showFiltersSelect(interaction, item) {
      try {
          // Armazenar item selecionado
          const searchId = `${interaction.user.id}_${Date.now()}`;
          this.activeSearches.set(searchId, {
              item: item,
              tier: null,
              enchant: null,
              quality: null
          });

          // Criar selects
          const tierSelect = new StringSelectMenuBuilder()
              .setCustomId(`market_filter_tier_${searchId}`)
              .setPlaceholder('🎚️ Selecione o Tier')
              .addOptions(
                  this.tiers.map(t => new StringSelectMenuOptionBuilder()
                      .setLabel(t.label)
                      .setValue(t.value)
                      .setEmoji(t.emoji)
                  )
              );

          const enchantSelect = new StringSelectMenuBuilder()
              .setCustomId(`market_filter_enchant_${searchId}`)
              .setPlaceholder('✨ Selecione o Encantamento')
              .addOptions(
                  this.enchants.map(e => new StringSelectMenuOptionBuilder()
                      .setLabel(e.label)
                      .setValue(e.value)
                      .setEmoji(e.emoji)
                  )
              );

          const qualitySelect = new StringSelectMenuBuilder()
              .setCustomId(`market_filter_quality_${searchId}`)
              .setPlaceholder('💎 Selecione a Qualidade')
              .addOptions(
                  this.qualities.map(q => new StringSelectMenuOptionBuilder()
                      .setLabel(q.label)
                      .setValue(q.value)
                      .setEmoji(q.emoji)
                  )
              );

          const row1 = new ActionRowBuilder().addComponents(tierSelect);
          const row2 = new ActionRowBuilder().addComponents(enchantSelect);
          const row3 = new ActionRowBuilder().addComponents(qualitySelect);

          const embed = new EmbedBuilder()
              .setTitle('⚙️ Configurar Pesquisa')
              .setDescription(
                  `**Item:** ${item.name}\n` +
                  `**ID:** \`${item.id}\`\n\n` +
                  `Configure os parâmetros da pesquisa:`
              )
              .setColor(0xE67E22)
              .setThumbnail(`https://render.albiononline.com/v1/item/${item.id}.png`);

          const buttons = new ActionRowBuilder()
              .addComponents(
                  new ButtonBuilder()
                      .setCustomId(`market_search_confirm_${searchId}`)
                      .setLabel('🔍 Buscar Preços')
                      .setStyle(ButtonStyle.Success)
                      .setDisabled(true), // Habilitar após seleções
                  new ButtonBuilder()
                      .setCustomId(`market_search_cancel_${searchId}`)
                      .setLabel('❌ Cancelar')
                      .setStyle(ButtonStyle.Danger)
              );

          const message = await interaction.reply({
              embeds: [embed],
              components: [row1, row2, row3, buttons],
              ephemeral: true,
              fetchReply: true
          });

          // Store message reference for updates
          const searchData = this.activeSearches.get(searchId);
          searchData.messageId = message.id;
          this.activeSearches.set(searchId, searchData);

      } catch (error) {
          console.error('[MarketHandler] Erro ao mostrar filtros:', error);
          throw error;
      }
  }

  /**
   * Atualiza filtros quando usuário seleciona
   */
  async updateFilter(interaction, type, searchId, value) {
      try {
          const searchData = this.activeSearches.get(searchId);
          if (!searchData) {
              await interaction.reply({
                  content: '❌ Sessão expirada. Comece uma nova pesquisa.',
                  ephemeral: true
              });
              return;
          }

          // Atualizar valor do filtro
          if (type === 'tier') searchData.tier = value;
          if (type === 'enchant') searchData.enchant = value;
          if (type === 'quality') searchData.quality = value;

          this.activeSearches.set(searchId, searchData);

          // Verificar se pode habilitar botão de busca
          const canSearch = searchData.tier && searchData.enchant !== null && searchData.quality;

          // Atualizar embed com seleções
          const embed = EmbedBuilder.from(interaction.message.embeds[0])
              .setFields(
                  {
                      name: '🎚️ Tier',
                      value: searchData.tier ? this.tiers.find(t => t.value === searchData.tier)?.label || 'N/A' : '⏳ Não selecionado',
                      inline: true
                  },
                  {
                      name: '✨ Encantamento',
                      value: searchData.enchant !== null ? this.enchants.find(e => e.value === searchData.enchant)?.label || 'N/A' : '⏳ Não selecionado',
                      inline: true
                  },
                  {
                      name: '💎 Qualidade',
                      value: searchData.quality ? this.qualities.find(q => q.value === searchData.quality)?.label || 'N/A' : '⏳ Não selecionado',
                      inline: true
                  }
              );

          // Atualizar componentes
          const components = interaction.message.components;
          const lastRow = components[components.length - 1];

          if (canSearch) {
              lastRow.components[0].setDisabled(false);
          }

          await interaction.update({
              embeds: [embed],
              components: components
          });

      } catch (error) {
          console.error('[MarketHandler] Erro ao atualizar filtro:', error);
          throw error;
      }
  }

  /**
   * Executa a busca de preços
   */
  async executeSearch(interaction, searchId) {
      try {
          const searchData = this.activeSearches.get(searchId);
          if (!searchData) {
              await interaction.reply({
                  content: '❌ Sessão expirada.',
                  ephemeral: true
              });
              return;
          }

          await interaction.deferReply({ ephemeral: false });

          // Construir ID do item
          const itemId = MarketApi.buildItemId(
              searchData.item.id,
              searchData.tier,
              parseInt(searchData.enchant)
          );

          // Buscar preços
          const priceData = await MarketApi.getItemPrices(itemId, {
              quality: parseInt(searchData.quality)
          });

          if (priceData.prices.length === 0) {
              await interaction.editReply({
                  content: `❌ Nenhum preço encontrado para **${searchData.item.name}** (T${searchData.tier}.${searchData.enchant})`,
                  embeds: []
              });
              return;
          }

          // Criar embed de resultados
          const embed = await this.createPriceEmbed(priceData, searchData);

          // Criar botões de ação
          const buttons = new ActionRowBuilder()
              .addComponents(
                  new ButtonBuilder()
                      .setCustomId(`market_history_${itemId}_${searchData.quality}`)
                      .setLabel('📊 Ver Histórico')
                      .setStyle(ButtonStyle.Primary),
                  new ButtonBuilder()
                      .setCustomId('market_search_again')
                      .setLabel('🔍 Nova Pesquisa')
                      .setStyle(ButtonStyle.Secondary)
              );

          await interaction.editReply({
              content: null,
              embeds: [embed],
              components: [buttons]
          });

          // Limpar sessão
          this.activeSearches.delete(searchId);

      } catch (error) {
          console.error('[MarketHandler] Erro ao executar busca:', error);
          await interaction.editReply({
              content: `❌ Erro ao buscar preços: ${error.message}`,
              embeds: []
          });
      }
  }

  /**
   * Cria embed com resultados de preços
   */
  async createPriceEmbed(priceData, searchData) {
      const embed = new EmbedBuilder()
          .setTitle(`🛒 ${searchData.item.name}`)
          .setDescription(
              `**Tier:** T${searchData.tier} **|** ` +
              `**Encantamento:** .${searchData.enchant} **|** ` +
              `**Qualidade:** ${MarketApi.qualities[searchData.quality]?.name || 'Normal'}`
          )
          .setColor(0x2ECC71)
          .setThumbnail(`https://render.albiononline.com/v1/item/${priceData.itemId}.png`)
          .setFooter({ text: `Dados: Albion Online Data Project • Atualizado: ${MarketApi.getTimeSince(priceData.lastUpdate)}` });

      // Ordenar preços por melhor venda (menor preço)
      const sellPrices = priceData.prices
          .filter(p => p.sellPrice > 0)
          .sort((a, b) => a.sellPrice - b.sellPrice);

      // Ordenar preços de compra (maior preço)
      const buyPrices = priceData.prices
          .filter(p => p.buyPrice > 0)
          .sort((a, b) => b.buyPrice - a.buyPrice);

      // Field de melhor preço de venda (para quem quer comprar)
      if (sellPrices.length > 0) {
          const best = sellPrices[0];
          embed.addFields({
              name: '💰 Melhor Preço de Venda (para comprar)',
              value: `**${MarketApi.formatPrice(best.sellPrice)}** silver em **${best.location}** ${MarketApi.qualities[best.quality]?.emoji || ''}`,
              inline: false
          });
      }

      // Field de melhor preço de compra (para quem quer vender)
      if (buyPrices.length > 0) {
          const best = buyPrices[0];
          embed.addFields({
              name: '💵 Melhor Preço de Compra (para vender)',
              value: `**${MarketApi.formatPrice(best.buyPrice)}** silver em **${best.location}** ${MarketApi.qualities[best.quality]?.emoji || ''}`,
              inline: false
          });
      }

      // Tabela de preços por cidade
      let pricesText = '';
      const locations = ['Bridgewatch', 'Caerleon', 'Fort Sterling', 'Lymhurst', 'Martlock', 'Thetford'];

      for (const loc of locations) {
          const locData = priceData.prices.find(p => p.location === loc);
          if (locData) {
              const sell = locData.sellPrice > 0 ? MarketApi.formatPrice(locData.sellPrice) : '---';
              const buy = locData.buyPrice > 0 ? MarketApi.formatPrice(locData.buyPrice) : '---';
              pricesText += `**${loc}:** Venda ${sell} | Compra ${buy}\n`;
          }
      }

      // Black Market separado (se existir)
      const bmData = priceData.prices.find(p => p.location === 'Black Market');
      if (bmData) {
          const sell = bmData.sellPrice > 0 ? MarketApi.formatPrice(bmData.sellPrice) : '---';
          pricesText += `\n⚫ **Black Market:** ${sell}`;
      }

      if (pricesText) {
          embed.addFields({
              name: '📍 Preços por Cidade',
              value: pricesText || 'Sem dados disponíveis',
              inline: false
          });
      }

      return embed;
  }

  /**
   * Mostra histórico de preços
   */
  async showPriceHistory(interaction, itemId, quality) {
      try {
          await interaction.deferReply({ ephemeral: true });

          const history = await MarketApi.getPriceHistory(itemId, 6, 24);

          if (!history || history.length === 0) {
              await interaction.editReply({
                  content: '❌ Histórico de preços não disponível para este item.',
                  embeds: []
              });
              return;
          }

          const embed = new EmbedBuilder()
              .setTitle('📊 Histórico de Preços')
              .setDescription(`Item ID: \`${itemId}\``)
              .setColor(0x9B59B6);

          // Processar dados do histórico
          for (const cityData of history.slice(0, 5)) {
              const prices = cityData.data.slice(-5).map(d => ({
                  timestamp: new Date(d.timestamp),
                  price: d.avg_price
              }));

              if (prices.length > 0) {
                  const priceHistory = prices.map(p => 
                      `${MarketApi.formatPrice(p.price)}`
                  ).join(' → ');

                  embed.addFields({
                      name: `📍 ${cityData.location}`,
                      value: `Últimos preços médios:\n${priceHistory}`,
                      inline: false
                  });
              }
          }

          await interaction.editReply({
              embeds: [embed]
          });

      } catch (error) {
          console.error('[MarketHandler] Erro ao buscar histórico:', error);
          await interaction.editReply({
              content: '❌ Erro ao carregar histórico de preços.',
              embeds: []
          });
      }
  }

  /**
   * Atualiza o cache de itens
   */
  async handleUpdateCache(interaction) {
      try {
          await interaction.deferReply({ ephemeral: true });

          await MarketApi.refreshItemsCache();

          await interaction.editReply({
              content: `✅ Cache de itens atualizado!\nTotal: **${MarketApi.itemsCache.size}** itens indexados.`
          });

      } catch (error) {
          console.error('[MarketHandler] Erro ao atualizar cache:', error);
          await interaction.editReply({
              content: '❌ Erro ao atualizar cache de itens.'
          });
      }
  }

  /**
   * Mostra ajuda do sistema
   */
  async showHelp(interaction) {
      const embed = new EmbedBuilder()
          .setTitle('❓ Ajuda - Mercado Albion')
          .setDescription(
              '**Como usar o sistema de pesquisa:**\n\n' +
              '1️⃣ **Pesquisar Item**\n' +
              'Digite o nome do item em inglês ou parte dele.\n' +
              'Exemplos: `bag`, `sword`, `cape`, `T4_`, `master`\n\n' +
              '2️⃣ **Selecionar Filtros**\n' +
              '• **Tier:** Nível do item (T4 a T8)\n' +
              '• **Encantamento:** .0 a .4 (nível de raridade)\n' +
              '• **Qualidade:** Normal a Obra-prima\n\n' +
              '3️⃣ **Interpretar Resultados**\n' +
              '• **Preço de Venda:** Valor para comprar o item\n' +
              '• **Preço de Compra:** Valor que jogadores pagam\n' +
              '• **Black Market:** Preço de venda para o sistema do jogo\n\n' +
              '**Dicas:**\n' +
              '• Black Market geralmente paga mais, mas tem taxa\n' +
              '• Qualidade afeta apenas itens equipáveis\n' +
              '• Dados atualizados a cada poucos minutos'
          )
          .setColor(0x3498DB);

      await interaction.reply({
          embeds: [embed],
          ephemeral: true
      });
  }

  /**
   * Cancela pesquisa
   */
  async cancelSearch(interaction, searchId) {
      this.activeSearches.delete(searchId);
      await interaction.message.delete().catch(() => {});
  }

  /**
   * Helper para obter emoji do tier
   */
  getTierEmoji(tier) {
      const tierMap = {
          'T1': '1️⃣', 'T2': '2️⃣', 'T3': '3️⃣', 'T4': '4️⃣',
          'T5': '5️⃣', 'T6': '6️⃣', 'T7': '7️⃣', 'T8': '8️⃣'
      };
      return tierMap[tier] || '📦';
  }
}

// Exportar instância singleton
const marketHandler = new MarketHandler();
module.exports = marketHandler;