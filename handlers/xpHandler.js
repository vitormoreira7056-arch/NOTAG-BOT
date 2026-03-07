const {
 EmbedBuilder,
 ActionRowBuilder,
 ButtonBuilder,
 ButtonStyle,
 ModalBuilder,
 TextInputBuilder,
 TextInputStyle,
 StringSelectMenuBuilder,
 StringSelectMenuOptionBuilder
} = require('discord.js');
const Database = require('../utils/database');

class XpHandler {
 constructor() {
  // Sistema de patentes baseado em Albion Online (50+ patentes)
  this.ranks = [
   // Tier 1 - Iniciante
   { level: 1, name: 'Recruta', emoji: '⚪', color: 0x95A5A6, description: 'Novo aventureiro' },
   { level: 2, name: 'Aprendiz de Ferreiro', emoji: '🔨', color: 0x95A5A6, description: 'Aprendendo os fundamentos' },
   { level: 3, name: 'Lenhador Novato', emoji: '🪓', color: 0x95A5A6, description: 'Coletando recursos básicos' },
   { level: 4, name: 'Minerador de Cobre', emoji: '⛏️', color: 0x95A5A6, description: 'Primeiras escavações' },
   { level: 5, name: 'Caçador de Coelhos', emoji: '🐰', color: 0x95A5A6, description: 'Iniciante na caça' },

   // Tier 2 - Bronze
   { level: 6, name: 'Guerreiro de Bronze', emoji: '🥉', color: 0xCD7F32, description: 'Primeiras batalhas' },
   { level: 7, name: 'Ferreiro Journeyman', emoji: '⚒️', color: 0xCD7F32, description: 'Dominando a forja' },
   { level: 8, name: 'Lenhador Adepto', emoji: '🌲', color: 0xCD7F32, description: 'Cortando madeira refinada' },
   { level: 9, name: 'Minerador de Estanho', emoji: '💎', color: 0xCD7F32, description: 'Minerando minerais raros' },
   { level: 10, name: 'Caçador de Lobos', emoji: '🐺', color: 0xCD7F32, description: 'Caçador experiente' },

   // Tier 3 - Prata
   { level: 11, name: 'Cavaleiro de Prata', emoji: '🥈', color: 0xC0C0C0, description: 'Elite em treinamento' },
   { level: 12, name: 'Ferreiro Expert', emoji: '🛡️', color: 0xC0C0C0, description: 'Criando armaduras médias' },
   { level: 13, name: 'Alquimista', emoji: '⚗️', color: 0xC0C0C0, description: 'Mestre das poções' },
   { level: 14, name: 'Minerador de Ferro', emoji: '🔩', color: 0xC0C0C0, description: 'Extração pesada' },
   { level: 15, name: 'Domador de Cavalos', emoji: '🐎', color: 0xC0C0C0, description: 'Cavaleiro experiente' },

   // Tier 4 - Ouro
   { level: 16, name: 'Campeão de Ouro', emoji: '🥇', color: 0xFFD700, description: 'Guerreiro de elite' },
   { level: 17, name: 'Ferreiro Mestre', emoji: '⚔️', color: 0xFFD700, description: 'Armas de qualidade superior' },
   { level: 18, name: 'Caçador de Ursos', emoji: '🐻', color: 0xFFD700, description: 'Caçador de grandes presas' },
   { level: 19, name: 'Explorador de Territórios', emoji: '🗺️', color: 0xFFD700, description: 'Mapeando o desconhecido' },
   { level: 20, name: 'Mercador de Luxo', emoji: '💰', color: 0xFFD700, description: 'Rico comerciante' },

   // Tier 5 - Platinium (Avalon)
   { level: 21, name: 'Defensor de Avalon', emoji: '🔱', color: 0xE5E4E2, description: 'Guardião das terras sagradas' },
   { level: 22, name: 'Ferreiro de Avalon', emoji: '🔮', color: 0xE5E4E2, description: 'Forjando itens mágicos' },
   { level: 23, name: 'Caçador de Demônios', emoji: '👿', color: 0xE5E4E2, description: 'Exterminador de mal' },
   { level: 24, name: 'Mestre Alquimista', emoji: '🧪', color: 0xE5E4E2, description: 'Poções épicas' },
   { level: 25, name: 'Lorde das Terras', emoji: '👑', color: 0xE5E4E2, description: 'Governante local' },

   // Tier 6 - Cristal
   { level: 26, name: 'Guerreiro de Cristal', emoji: '💠', color: 0x00FFFF, description: 'Poder cristalino' },
   { level: 27, name: 'Invocador', emoji: '🔯', color: 0x00FFFF, description: 'Mestre da invocação' },
   { level: 28, name: 'Domador de Dragões', emoji: '🐉', color: 0x00FFFF, description: 'Controlador de dragões' },
   { level: 29, name: 'Arcanjo', emoji: '👼', color: 0x00FFFF, description: 'Ser celestial' },
   { level: 30, name: 'Eminência', emoji: '⭐', color: 0x00FFFF, description: 'Respeitado por todos' },

   // Tier 7 - Obsidian
   { level: 31, name: 'Sombra de Obsidian', emoji: '🌑', color: 0x1C1C1C, description: 'Mestre das sombras' },
   { level: 32, name: 'Necromante', emoji: '💀', color: 0x1C1C1C, description: 'Manipulador dos mortos' },
   { level: 33, name: 'Caçador de Gigantes', emoji: '👹', color: 0x1C1C1C, description: 'Matador de gigantes' },
   { level: 34, name: 'Líder de Guilda', emoji: '🏰', color: 0x1C1C1C, description: 'Comandante de exércitos' },
   { level: 35, name: 'Lenda Viva', emoji: '📜', color: 0x1C1C1C, description: 'Histórias contam sobre você' },

   // Tier 8 - Artefacto
   { level: 36, name: 'Portador de Artefato', emoji: '🏺', color: 0xFF6B00, description: 'Possui poder ancestral' },
   { level: 37, name: 'Mestre dos elementos', emoji: '🔥', color: 0xFF6B00, description: 'Controla fogo, água, terra e ar' },
   { level: 38, name: 'Cavaleiro da Morte', emoji: '⚰️', color: 0xFF6B00, description: 'Imortal em batalha' },
   { level: 39, name: 'Rei dos Ladrões', emoji: '🗡️', color: 0xFF6B00, description: 'Mestre do roubo e assassinato' },
   { level: 40, name: 'Arquimago', emoji: '🧙', color: 0xFF6B00, description: 'Maior mago do reino' },

   // Tier 9 - Épico
   { level: 41, name: 'Herói de Albion', emoji: '🦸', color: 0x9932CC, description: 'Salvador do reino' },
   { level: 42, name: 'Guardião Real', emoji: '🛡️', color: 0x9932CC, description: 'Protetor do trono' },
   { level: 43, name: 'Matador de Deuses', emoji: '⚡', color: 0x9932CC, description: 'Desafiou divindades' },
   { level: 44, name: 'Imortal', emoji: '♾️', color: 0x9932CC, description: 'Não pode ser derrotado' },
   { level: 45, name: 'Titan', emoji: '🏔️', color: 0x9932CC, description: 'Força colossal' },

   // Tier 10 - Lendário
   { level: 46, name: 'Avatar', emoji: '👤', color: 0xFFD700, description: 'Encarnação divina' },
   { level: 47, name: 'Deus Menor', emoji: '☀️', color: 0xFFD700, description: 'Ascendido à divindade' },
   { level: 48, name: 'Criador de Mundos', emoji: '🌎', color: 0xFFD700, description: 'Poder de criação' },
   { level: 49, name: 'Eterno', emoji: '⏳', color: 0xFFD700, description: 'Existe além do tempo' },
   { level: 50, name: 'Lenda de Albion', emoji: '👑', color: 0xFFD700, description: 'O maior de todos os tempos' },

   // Tier 11 - Infinito (sem limite)
   { level: 51, name: 'Transcendental', emoji: '🔯', color: 0xFFFFFF, description: 'Além da compreensão' },
   { level: 52, name: 'Cósmico', emoji: '🌌', color: 0xFFFFFF, description: 'Poder universal' },
   { level: 53, name: 'Onipotente', emoji: '💫', color: 0xFFFFFF, description: 'Todo-poderoso' },
   { level: 54, name: 'Onisciente', emoji: '📚', color: 0xFFFFFF, description: 'Sabe tudo' },
   { level: 55, name: 'Onipresente', emoji: '👁️', color: 0xFFFFFF, description: 'Está em todo lugar' }
  ];

  // Condecorações/Insígnias (100+)
  this.insignias = [
   // Insígnias de Evento
   { id: 'raid_avalon_1', name: 'Explorador de Avalon', emoji: '🔱', description: 'Participou de 1 Raid Avalon', tier: 'bronze' },
   { id: 'raid_avalon_10', name: 'Veterano de Avalon', emoji: '🔱', description: 'Participou de 10 Raids Avalon', tier: 'prata' },
   { id: 'raid_avalon_50', name: 'Conquistador de Avalon', emoji: '👑', description: 'Participou de 50 Raids Avalon', tier: 'ouro' },
   { id: 'raid_avalon_100', name: 'Mestre de Avalon', emoji: '💎', description: 'Participou de 100 Raids Avalon', tier: 'platina' },

   { id: 'gank_1', name: 'Caçador Iniciante', emoji: '🏹', description: 'Realizou 1 gank bem-sucedido', tier: 'bronze' },
   { id: 'gank_10', name: 'Predador', emoji: '🐺', description: 'Realizou 10 ganks', tier: 'prata' },
   { id: 'gank_50', name: 'Assassino Sombrio', emoji: '🗡️', description: 'Realizou 50 ganks', tier: 'ouro' },
   { id: 'gank_100', name: 'Anjo da Morte', emoji: '☠️', description: 'Realizou 100 ganks', tier: 'platina' },

   { id: 'cta_1', name: 'Soldado', emoji: '⚔️', description: 'Participou de 1 CTA', tier: 'bronze' },
   { id: 'cta_10', name: 'Guerreiro', emoji: '🛡️', description: 'Participou de 10 CTAs', tier: 'prata' },
   { id: 'cta_50', name: 'Campeão', emoji: '⚡', description: 'Participou de 50 CTAs', tier: 'ouro' },
   { id: 'cta_100', name: 'General', emoji: '🎖️', description: 'Participou de 100 CTAs', tier: 'platina' },

   // Insígnias de Recursos
   { id: 'gather_t1', name: 'Coletor Novato', emoji: '🌾', description: 'Coletou recursos T1', tier: 'bronze' },
   { id: 'gather_t5', name: 'Coletor Experiente', emoji: '🌲', description: 'Coletou recursos T5', tier: 'prata' },
   { id: 'gather_t8', name: 'Coletor Mestre', emoji: '💎', description: 'Coletou recursos T8', tier: 'ouro' },

   // Insígnias de Craft
   { id: 'craft_100', name: 'Artesão', emoji: '🔨', description: 'Criou 100 itens', tier: 'bronze' },
   { id: 'craft_1000', name: 'Mestre Artesão', emoji: '⚒️', description: 'Criou 1000 itens', tier: 'prata' },
   { id: 'craft_10000', name: 'Lenda da Forja', emoji: '🔥', description: 'Criou 10000 itens', tier: 'ouro' },

   // Insígnias de PVP
   { id: 'pvp_kills_10', name: 'Derramador de Sangue', emoji: '🩸', description: '10 kills em PvP', tier: 'bronze' },
   { id: 'pvp_kills_100', name: 'Carniceiro', emoji: '⚔️', description: '100 kills em PvP', tier: 'prata' },
   { id: 'pvp_kills_1000', name: 'Deus da Guerra', emoji: '⚡', description: '1000 kills em PvP', tier: 'ouro' },

   // Insígnias de Economia
   { id: 'rich_1m', name: 'Milionário', emoji: '💰', description: 'Acumulou 1 milhão de prata', tier: 'prata' },
   { id: 'rich_10m', name: 'Multimilionário', emoji: '💎', description: 'Acumulou 10 milhões', tier: 'ouro' },
   { id: 'rich_100m', name: 'Magnata', emoji: '🏦', description: 'Acumulou 100 milhões', tier: 'platina' },

   // Insígnias Especiais
   { id: 'first_blood', name: 'First Blood', emoji: '🩸', description: 'Primeiro kill do servidor', tier: 'ouro' },
   { id: 'survivor', name: 'Sobrevivente', emoji: '🏥', description: 'Sobreviveu a um ataque mortal', tier: 'prata' },
   { id: 'naked', name: 'Guerreiro Nu', emoji: '😱', description: 'Matou um inimigo sem armadura', tier: 'bronze' },
   { id: 'treasure', name: 'Caçador de Tesouros', emoji: '💎', description: 'Encontrou um tesouro raro', tier: 'ouro' },
   { id: 'diplomat', name: 'Diplomata', emoji: '🤝', description: 'Negociou paz entre guildas', tier: 'platina' },
   { id: 'spy', name: 'Espião', emoji: '🕵️', description: 'Descobriu informações secretas', tier: 'prata' },
   { id: 'builder', name: 'Construtor', emoji: '🏗️', description: 'Construiu um edifício importante', tier: 'bronze' },
   { id: 'farmer', name: 'Fazendeiro', emoji: '🌽', description: 'Cultivou 1000 alimentos', tier: 'bronze' },
   { id: 'fisher', name: 'Pescador', emoji: '🎣', description: 'Pescou 500 peixes', tier: 'bronze' },
   { id: 'cook', name: 'Chef', emoji: '👨‍🍳', description: 'Cozinhou 500 refeições', tier: 'prata' },

   // Insígnias de Eventos Específicos (conquistas)
   { id: 'avalon_6_1', name: 'Conquistador 6.1', emoji: '🔥', description: 'Completou 6 Raids Avalon 6.1', tier: 'ouro' },
   { id: 'avalon_7_1', name: 'Conquistador 7.1', emoji: '⚡', description: 'Completou 6 Raids Avalon 7.1', tier: 'platina' },
   { id: 'avalon_8_1', name: 'Conquistador 8.1', emoji: '👑', description: 'Completou 6 Raids Avalon 8.1', tier: 'diamante' },
   { id: 'gank_red', name: 'Terror das Terras Negras', emoji: '⚫', description: '50 ganks na Black Zone', tier: 'ouro' },
   { id: 'cta_defender', name: 'Defensor do Castelo', emoji: '🏰', description: 'Defendeu com sucesso 10 CTAs', tier: 'prata' },
   { id: 'zvz_50', name: 'Veterano de ZvZ', emoji: '⚔️', description: 'Participou de 50 ZvZs', tier: 'ouro' },
   { id: 'healer_100', name: 'Anjo Guardião', emoji: '👼', description: 'Curou aliados 100 vezes', tier: 'prata' },
   { id: 'tank_100', name: 'Muro Inquebrável', emoji: '🛡️', description: 'Tankou danos 100 vezes', tier: 'prata' },
   { id: 'dps_1000', name: 'Máquina de Dano', emoji: '⚔️', description: 'Causou 1000k de dano', tier: 'ouro' },

   // Mais insígnias para chegar a 100+
   { id: 'loyalty_30', name: 'Leal', emoji: '🤝', description: '30 dias na guilda', tier: 'bronze' },
   { id: 'loyalty_90', name: 'Dedicado', emoji: '💎', description: '90 dias na guilda', tier: 'prata' },
   { id: 'loyalty_365', name: 'Veterano', emoji: '🎖️', description: '1 ano na guilda', tier: 'ouro' },
   { id: 'recruiter_5', name: 'Recrutador', emoji: '📢', description: 'Recrutou 5 membros', tier: 'prata' },
   { id: 'recruiter_20', name: 'Expansor', emoji: '🌟', description: 'Recrutou 20 membros', tier: 'ouro' },
   { id: 'donator', name: 'Benfeitor', emoji: '❤️', description: 'Doou para a guilda', tier: 'prata' },
   { id: 'strategist', name: 'Estrategista', emoji: '📋', description: 'Liderou tática vitoriosa', tier: 'ouro' },
   { id: 'scout', name: 'Batedor', emoji: '🔭', description: 'Descobriu 100 inimigos', tier: 'bronze' },
   { id: 'explorer', name: 'Explorador', emoji: '🗺️', description: 'Visitou todas as zonas', tier: 'prata' },
   { id: 'merchant', name: 'Comerciante', emoji: '💼', description: 'Realizou 100 vendas', tier: 'bronze' },
   { id: 'crafter_flawless', name: 'Perfeccionista', emoji: '✨', description: 'Criou item flawless', tier: 'ouro' },
   { id: 'crafter_masterpiece', name: 'Obra-prima', emoji: '🏆', description: 'Criou masterpiece', tier: 'platina' },
   { id: 'fame_1m', name: 'Famoso', emoji: '📸', description: 'Alcançou 1M de fama', tier: 'prata' },
   { id: 'fame_10m', name: 'Celebridade', emoji: '🎬', description: 'Alcançou 10M de fama', tier: 'ouro' },
   { id: 'fame_100m', name: 'Ícone', emoji: '🎤', description: 'Alcançou 100M de fama', tier: 'platina' },
   { id: 'gatherer_rare', name: 'Prospector', emoji: '⛏️', description: 'Encontrou recurso raro', tier: 'ouro' },
   { id: 'fisher_big', name: 'Pescador de Lendários', emoji: '🐋', description: 'Pescou peixe lendário', tier: 'ouro' },
   { id: 'hunter_boss', name: 'Caçador de Chefes', emoji: '👹', description: 'Matou chefe mundial', tier: 'platina' },
   { id: 'dungeon_100', name: 'Explorador de Masmorras', emoji: '🏚️', description: 'Completou 100 dungeons', tier: 'prata' },
   { id: 'dungeon_1000', name: 'Senhor das Masmorras', emoji: '⚰️', description: 'Completou 1000 dungeons', tier: 'ouro' },
   { id: 'hellgate_10', name: 'Portador do Inferno', emoji: '🔥', description: '10 Hellgates', tier: 'ouro' },
   { id: 'corrupted_50', name: 'Corrompido', emoji: '🌀', description: '50 Corrupted Dungeons', tier: 'prata' },
   { id: 'arena_100', name: 'Gladiador', emoji: '🏟️', description: '100 vitórias na arena', tier: 'prata' },
   { id: 'arena_500', name: 'Campeão da Arena', emoji: '🏆', description: '500 vitórias na arena', tier: 'ouro' },
   { id: 'faction_warrior', name: 'Guerreiro de Facção', emoji: '⚔️', description: 'Ganhou 100 batalhas de facção', tier: 'ouro' },
   { id: 'transport_100', name: 'Transportador', emoji: '🐴', description: 'Transportou 100 cargas', tier: 'bronze' },
   { id: 'transport_1000', name: 'Mensageiro Real', emoji: '📜', description: 'Transportou 1000 cargas', tier: 'prata' },
   { id: 'escape_artist', name: 'Mágico do Escape', emoji: '🎩', description: 'Escapou de 50 emboscadas', tier: 'prata' },
   { id: 'noclick', name: 'Sortudo', emoji: '🍀', description: 'Sobreviveu sem clicar', tier: 'bronze' },
   { id: 'night_owl', name: 'Coruja Noturna', emoji: '🦉', description: 'Jogou durante a noite', tier: 'bronze' },
   { id: 'early_bird', name: 'Madrugador', emoji: '🐦', description: 'Jogou de manhã cedo', tier: 'bronze' },
   { id: 'weekend_warrior', name: 'Guerreiro de Fim de Semana', emoji: '🎮', description: 'Jogou 10 fins de semana', tier: 'prata' },
   { id: 'daily_30', name: 'Dedicado Diário', emoji: '📅', description: 'Jogou 30 dias seguidos', tier: 'ouro' },
   { id: 'helpful', name: 'Prestativo', emoji: '🆘', description: 'Ajudou 50 jogadores', tier: 'prata' },
   { id: 'teacher', name: 'Mentor', emoji: '👨‍🏫', description: 'Ensinou 10 novatos', tier: 'ouro' },
   { id: 'comedian', name: 'Comediante', emoji: '😂', description: 'Fez todos rirem', tier: 'bronze' },
   { id: 'serious', name: 'Sério', emoji: '😐', description: 'Nunca riu (ou quase)', tier: 'bronze' },
   { id: 'organizer', name: 'Organizador', emoji: '📊', description: 'Organizou 10 eventos', tier: 'ouro' },
   { id: 'peacekeeper', name: 'Pacificador', emoji: '☮️', description: 'Resolveu 10 conflitos', tier: 'prata' },
   { id: 'trigger_happy', name: 'Gatilho Fácil', emoji: '🔫', description: 'Atacou primeiro 50x', tier: 'bronze' },
   { id: 'patient', name: 'Paciente', emoji: '🧘', description: 'Esperou 1h sem reclamar', tier: 'bronze' },
   { id: 'speedster', name: 'Veloz', emoji: '⚡', description: 'Terminou dungeon em tempo recorde', tier: 'ouro' },
   { id: 'collector', name: 'Colecionador', emoji: '🎒', description: 'Coletou 100 itens únicos', tier: 'prata' },
   { id: 'hoarder', name: 'Acumulador', emoji: '🏚️', description: 'Inventário sempre cheio', tier: 'bronze' },
   { id: 'minimalist', name: 'Minimalista', emoji: '🎋', description: 'Só carrega o essencial', tier: 'bronze' },
   { id: 'fashion', name: 'Icone de Moda', emoji: '👗', description: 'Tem 10 skins diferentes', tier: 'prata' },
   { id: 'mount_collector', name: 'Domador', emoji: '🦎', description: 'Possui 20 montarias', tier: 'ouro' },
   { id: 'house_owner', name: 'Proprietário', emoji: '🏠', description: 'Possui uma casa', tier: 'prata' },
   { id: 'island_king', name: 'Rei da Ilha', emoji: '🏝️', description: 'Ilha completa', tier: 'ouro' },
   { id: 'guild_island', name: 'Morador da Guilda', emoji: '🏘️', description: 'Vive na ilha da guilda', tier: 'bronze' },
   { id: 'city_dweller', name: 'Citadino', emoji: '🌆', description: 'Vive na cidade', tier: 'bronze' },
   { id: 'hermit', name: 'Eremita', emoji: '⛺', description: 'Vive longe de todos', tier: 'bronze' },
   { id: 'social_butterfly', name: 'Borboleta Social', emoji: '🦋', description: 'Amigo de todos', tier: 'prata' },
   { id: 'lonewolf', name: 'Lobo Solitário', emoji: '🐺', description: 'Prefere jogar solo', tier: 'bronze' },
   { id: 'team_player', name: 'Jogador de Equipe', emoji: '👥', description: 'Sempre em grupo', tier: 'prata' },
   { id: 'shot_caller', name: 'Líder Nato', emoji: '📢', description: 'Comandou 50 batalhas', tier: 'ouro' },
   { id: 'listener', name: 'Ouvinte', emoji: '👂', description: 'Sempre segue calls', tier: 'prata' },
   { id: 'initiator', name: 'Iniciador', emoji: '🚀', description: 'Começou 100 lutas', tier: 'ouro' },
   { id: 'finisher', name: 'Finalizador', emoji: '💀', description: 'Deu o último golpe 100x', tier: 'ouro' },
   { id: 'damage_sponge', name: 'Esponja de Dano', emoji: '🧽', description: 'Recebeu 1M de dano', tier: 'prata' },
   { id: 'healer_god', name: 'Deus da Cura', emoji: '💚', description: 'Curou 1M de HP', tier: 'ouro' },
   { id: 'support_god', name: 'Deus do Suporte', emoji: '🛡️', description: 'Buffou aliados 1000x', tier: 'ouro' },
   { id: 'debuffer', name: 'Debuffer', emoji: '💜', description: 'Debuffou inimigos 1000x', tier: 'prata' },
   { id: 'crowd_control', name: 'Controle de Multidão', emoji: '🕸️', description: 'CC em 500 inimigos', tier: 'prata' },
   { id: 'kiter', name: 'Kiter', emoji: '🏃', description: 'Kiteou inimigos 100x', tier: 'prata' },
   { id: 'bruiser', name: 'Brutamonte', emoji: '💪', description: 'Tankou e matou', tier: 'ouro' },
   { id: 'assassin', name: 'Assassino', emoji: '🗡️', description: 'Matou em 3s', tier: 'ouro' },
   { id: 'sniper', name: 'Atirador', emoji: '🎯', description: 'Matou à distância', tier: 'prata' },
   { id: 'brawler', name: 'Brigão', emoji: '👊', description: 'Matou no corpo-a-corpo', tier: 'prata' },
   { id: 'mage', name: 'Mago', emoji: '🔮', description: 'Usou magias 1000x', tier: 'prata' },
   { id: 'archer', name: 'Arqueiro', emoji: '🏹', description: 'Acertou 1000 flechas', tier: 'prata' },
   { id: 'sword_master', name: 'Mestre da Espada', emoji: '⚔️', description: '100 kills com espada', tier: 'ouro' },
   { id: 'axe_master', name: 'Mestre do Machado', emoji: '🪓', description: '100 kills com machado', tier: 'ouro' },
   { id: 'mace_master', name: 'Mestre da Maça', emoji: '🔨', description: '100 kills com maça', tier: 'ouro' },
   { id: 'spear_master', name: 'Mestre da Lança', emoji: '🔱', description: '100 kills com lança', tier: 'ouro' },
   { id: 'dagger_master', name: 'Mestre da Adaga', emoji: '🗡️', description: '100 kills com adaga', tier: 'ouro' },
   { id: 'nature_master', name: 'Mestre da Natureza', emoji: '🌿', description: '100 kills com nature', tier: 'ouro' },
   { id: 'fire_master', name: 'Mestre do Fogo', emoji: '🔥', description: '100 kills com fogo', tier: 'ouro' },
   { id: 'frost_master', name: 'Mestre do Gelo', emoji: '❄️', description: '100 kills com gelo', tier: 'ouro' },
   { id: 'arcane_master', name: 'Mestre Arcano', emoji: '🔮', description: '100 kills com arcano', tier: 'ouro' },
   { id: 'holy_master', name: 'Mestre Sagrado', emoji: '✨', description: '100 kills com sagrado', tier: 'ouro' },
   { id: 'curse_master', name: 'Mestre da Maldição', emoji: '💀', description: '100 kills com curse', tier: 'ouro' }
  ];
 }

 // ========== Helper para valores seguros ==========
 /**
  * Formata um número para string localizada, retornando '0' se undefined/null
  * @param {number} value - Valor a formatar
  * @returns {string} Valor formatado ou '0'
  */
 formatSafeNumber(value) {
  if (value === undefined || value === null || isNaN(value)) {
   return '0';
  }
  return value.toLocaleString();
 }

 getRankByLevel(level) {
  // Se passar do nível 55, continua com o padrão do último rank mas aumenta o número
  if (level > 55) {
   const baseRank = this.ranks[this.ranks.length - 1];
   return {
    ...baseRank,
    level: level,
    name: `${baseRank.name} +${level - 55}`,
    description: `Nível transcendental ${level}`
   };
  }
  return this.ranks.find(r => r.level === level) || this.ranks[0];
 }

 getXpForNextLevel(currentLevel) {
  // Fórmula de XP: cada nível precisa de mais 100 XP que o anterior
  // Nível 1: 100 XP
  // Nível 2: 200 XP
  // Nível 3: 300 XP...
  return currentLevel * 100;
 }

 async addXp(userId, amount, reason, guild, channel) {
  try {
   const user = Database.getUser(userId);

   // Inicializar XP se não existir
   if (!user.xp) user.xp = 0;
   if (!user.level) user.level = 1;
   if (!user.totalXp) user.totalXp = 0;
   if (!user.insignias) user.insignias = [];

   const oldLevel = user.level;
   user.xp += amount;
   user.totalXp += amount;

   // Verificar level up
   let leveledUp = false;
   while (user.xp >= this.getXpForNextLevel(user.level)) {
    user.xp -= this.getXpForNextLevel(user.level);
    user.level++;
    leveledUp = true;
   }

   Database.updateUser(userId, user);

   // Enviar log no canal log-xp
   if (channel) {
    await this.sendXpLog(channel, userId, amount, reason, user.level, leveledUp);
   }

   // Se upou de nível, enviar DM
   if (leveledUp) {
    await this.sendLevelUpDM(userId, oldLevel, user.level, guild);
   }

   return { success: true, leveledUp, newLevel: user.level };
  } catch (error) {
   console.error(`[XpHandler] Error adding XP:`, error);
   return { success: false, error };
  }
 }

 async sendXpLog(channel, userId, amount, reason, currentLevel, leveledUp) {
  try {
   const user = await global.client.users.fetch(userId).catch(() => null);
   const rank = this.getRankByLevel(currentLevel);

   const embed = new EmbedBuilder()
    .setTitle('📈 GANHO DE XP')
    .setDescription(
     `**Jogador:** <@${userId}> ${user ? `(${user.tag})` : ''}\n` +
     `**XP Ganho:** \`+${amount} XP\`\n` +
     `**Motivo:** ${reason}\n` +
     `**Nível Atual:** \`${currentLevel}\` ${rank.emoji} ${rank.name}\n` +
     `${leveledUp ? '🎉 **LEVEL UP!**' : ''}`
    )
    .setColor(rank.color)
    .setThumbnail('https://i.imgur.com/5K9Q5ZK.png')
    .setFooter({ text: 'Sistema de XP • NOTAG Bot' })
    .setTimestamp();

   await channel.send({ embeds: [embed] });
  } catch (error) {
   console.error(`[XpHandler] Error sending XP log:`, error);
  }
 }

 async sendLevelUpDM(userId, oldLevel, newLevel, guild) {
  try {
   const user = await global.client.users.fetch(userId);
   const oldRank = this.getRankByLevel(oldLevel);
   const newRank = this.getRankByLevel(newLevel);

   const embed = new EmbedBuilder()
    .setTitle('🎉 LEVEL UP!')
    .setDescription(
     `🎊 **Parabéns! Você subiu de nível!**\n\n` +
     `⬆️ **Nível ${oldLevel}** ${oldRank.emoji} → **Nível ${newLevel}** ${newRank.emoji}\n\n` +
     `🏆 **Nova Patente:** ${newRank.name}\n` +
     `📝 **Descrição:** ${newRank.description}\n\n` +
     `💪 Continue participando de eventos para subir mais!`
    )
    .setColor(newRank.color)
    .setThumbnail('https://i.imgur.com/5K9Q5ZK.png')
    .setImage('https://i.imgur.com/JPepvGx.png')
    .setFooter({
     text: 'NOTAG Bot • Sistema de Progressão',
     iconURL: 'https://i.imgur.com/8QBYRrm.png'
    })
    .setTimestamp();

   // Se mudou de tier (cor diferente), adicionar destaque especial
   if (oldRank.color !== newRank.color) {
    embed.addFields({
     name: '🌟 PROMOÇÃO DE TIER!',
     value: `Você foi promovido de tier! Novos desafios o aguardam!`,
     inline: false
    });
   }

   await user.send({ embeds: [embed] });
  } catch (error) {
   console.error(`[XpHandler] Error sending level up DM:`, error);
  }
 }

 calculateEventXp(participationPercent, eventType = 'normal') {
  // Base XP por participação
  let baseXp = 0;

  if (participationPercent >= 100) baseXp = 60;
  else if (participationPercent >= 90) baseXp = 55;
  else if (participationPercent >= 80) baseXp = 50;
  else if (participationPercent >= 70) baseXp = 48;
  else if (participationPercent >= 60) baseXp = 45;
  else if (participationPercent >= 50) baseXp = 45;
  else if (participationPercent >= 40) baseXp = 40;
  else if (participationPercent >= 30) baseXp = 35;
  else if (participationPercent >= 20) baseXp = 30;
  else if (participationPercent >= 10) baseXp = 20;
  else baseXp = 10;

  // Multiplicadores por tipo de evento
  const multipliers = {
   'normal': 1,
   'avalon': 2.5,
   'gank': 1.8,
   'cta': 2.0,
   'dungeon': 1.2,
   'gathering': 1.0,
   'crafting': 1.0,
   'pvp': 1.5,
   'zvz': 2.2,
   'hellgate': 1.8,
   'corrupted': 1.6,
   'faction': 1.4,
   'orb_green': 1, // 40 XP base
   'orb_blue': 1, // 90 XP base
   'orb_purple': 1, // 200 XP base
   'orb_gold': 1 // 500 XP base
  };

  const multiplier = multipliers[eventType] || 1;
  return Math.floor(baseXp * multiplier);
 }

 async showProfile(userId, guild) {
  try {
   const user = Database.getUser(userId);
   const discordUser = await global.client.users.fetch(userId);
   const member = await guild.members.fetch(userId).catch(() => null);

   // Validação de segurança para valores numéricos
   const level = user.level || 1;
   const xp = user.xp || 0;
   const totalXp = user.totalXp || 0;
   const rank = this.getRankByLevel(level);
   const xpForNext = this.getXpForNextLevel(level);
   const progressPercent = Math.floor((xp / xpForNext) * 100);
   const saldo = user.saldo || 0;
   const eventosParticipados = user.eventosParticipados || 0;

   // Criar barra de progresso
   const progressBar = this.createProgressBar(progressPercent);

   const embed = new EmbedBuilder()
    .setTitle(`👤 PERFIL DE ${member?.nickname || discordUser.username}`)
    .setDescription(
     `**📊 Nível ${level}** ${rank.emoji} **${rank.name}**\n` +
     `\`${progressBar}\` **${progressPercent}%**\n` +
     `**XP:** \`${this.formatSafeNumber(xp)}\` / \`${this.formatSafeNumber(xpForNext)}\`\n` +
     `**XP Total:** \`${this.formatSafeNumber(totalXp)}\`\n\n` +
     `**💰 Saldo:** \`${this.formatSafeNumber(saldo)}\`\n` +
     `**🎯 Eventos:** \`${eventosParticipados}\``
    )
    .setColor(rank.color)
    .setThumbnail(discordUser.displayAvatarURL({ dynamic: true }))
    .setFooter({
     text: `ID: ${userId} • NOTAG Bot`,
     iconURL: 'https://i.imgur.com/8QBYRrm.png'
    })
    .setTimestamp();

   // Adicionar insígnias se tiver
   if (user.insignias && user.insignias.length > 0) {
    const insigniasText = user.insignias.map(id => {
     const ins = this.insignias.find(i => i.id === id);
     return ins ? `${ins.emoji} ${ins.name}` : id;
    }).join(' • ');

    embed.addFields({
     name: '🏅 Condecorações',
     value: insigniasText || 'Nenhuma',
     inline: false
    });
   }

   return embed;
  } catch (error) {
   console.error(`[XpHandler] Error showing profile:`, error);
   return null;
  }
 }

 createProgressBar(percent) {
  const filled = Math.floor(percent / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
 }

 async addInsignia(userId, insigniaId) {
  try {
   const user = Database.getUser(userId);
   if (!user.insignias) user.insignias = [];

   // Verificar se já tem
   if (user.insignias.includes(insigniaId)) {
    return { success: false, alreadyHas: true };
   }

   const insignia = this.insignias.find(i => i.id === insigniaId);
   if (!insignia) {
    return { success: false, notFound: true };
   }

   user.insignias.push(insigniaId);
   Database.updateUser(userId, user);

   // Enviar DM sobre nova condecoração
   await this.sendInsigniaDM(userId, insignia);

   return { success: true, insignia };
  } catch (error) {
   console.error(`[XpHandler] Error adding insignia:`, error);
   return { success: false, error };
  }
 }

 async sendInsigniaDM(userId, insignia) {
  try {
   const user = await global.client.users.fetch(userId);

   const tierColors = {
    'bronze': 0xCD7F32,
    'prata': 0xC0C0C0,
    'ouro': 0xFFD700,
    'platina': 0xE5E4E2,
    'diamante': 0xB9F2FF
   };

   const embed = new EmbedBuilder()
    .setTitle('🏅 NOVA CONDECORAÇÃO!')
    .setDescription(
     `🎊 **Parabéns! Você ganhou uma nova insígnia!**\n\n` +
     `${insignia.emoji} **${insignia.name}**\n` +
     `📝 ${insignia.description}\n` +
     `💎 Tier: ${insignia.tier.toUpperCase()}\n\n` +
     `Esta insígnia agora aparece no seu perfil!`
    )
    .setColor(tierColors[insignia.tier] || 0xFFD700)
    .setThumbnail('https://i.imgur.com/5K9Q5ZK.png')
    .setFooter({
     text: 'NOTAG Bot • Sistema de Conquistas',
     iconURL: 'https://i.imgur.com/8QBYRrm.png'
    })
    .setTimestamp();

   await user.send({ embeds: [embed] });
  } catch (error) {
   console.error(`[XpHandler] Error sending insignia DM:`, error);
  }
 }
}

module.exports = new XpHandler();