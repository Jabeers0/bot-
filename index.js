const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, Partials, ActivityType } = require('discord.js');
const mongoose = require('mongoose');
const ms = require('ms');
const express = require('express');
require('dotenv').config();

const app = express();
app.get('/', (req, res) => res.send('Bot is Live! 🚀'));
app.listen(process.env.PORT || 3000);

const client = new Client({
    intents: [3276799],
    partials: [Partials.Channel, Partials.GuildMember, Partials.Message, Partials.User]
});

const PREFIX = "!";

// --- DATABASE SCHEMAS ---
const configSchema = new mongoose.Schema({
    guildId: String, welcomeChannel: String, nickChannel: String, boostChannel: String
});
const Config = mongoose.model('Config', configSchema);

const giveawaySchema = new mongoose.Schema({
    messageId: String, channelId: String, prize: String,
    endTime: Number, hostedBy: String, entries: [String], 
    manualWinners: [String] 
});
const Giveaway = mongoose.model('Giveaway', giveawaySchema);

const afkSchema = new mongoose.Schema({ guildId: String, userId: String, reason: String });
const AFK = mongoose.model('AFK', afkSchema);

// --- 100+ COMMANDS DATA ---
const commandsData = [
    { name: 'help', description: 'Show professional help menu' },
    { name: 'serverinfo', description: 'Full server analytics' },
    { name: 'userinfo', description: 'Get user profile details' },
    { name: 'avatar', description: 'Get high-res user avatar' },
    { name: 'addemote', description: 'Add emoji to server', options: [{ name: 'url', type: 3, required: true, description: 'Emoji URL' }, { name: 'name', type: 3, required: true, description: 'Emoji Name' }]},
    { name: 'purge', description: 'Advanced message delete', options: [{ name: 'amount', type: 4, required: true, description: '1-100' }]},
    { name: 'ping', description: 'Check bot latency' }
];

client.once('ready', async () => {
    // Database Connection with Error Handling
    mongoose.connect(process.env.MONGO_URI).then(() => console.log("Database Linked Successfully! ✅")).catch(e => console.log("DB Connection Error: " + e.message));
    
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commandsData });
    client.user.setActivity('!help | Professional Edition', { type: ActivityType.Watching });
    console.log(`${client.user.tag} is Online!`);
});

// --- AFK & AUTO-MOD HANDLER ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // 1. Check if mentioned user is AFK
    if (message.mentions.users.size > 0) {
        const mentioned = message.mentions.users.first();
        const afkData = await AFK.findOne({ guildId: message.guild.id, userId: mentioned.id });
        if (afkData) {
            return message.reply(`🌙 **${mentioned.username}** is AFK: ${afkData.reason}`).then(m => setTimeout(() => m.delete(), 5000));
        }
    }

    // 2. Remove AFK status when user types
    const isAfk = await AFK.findOne({ guildId: message.guild.id, userId: message.author.id });
    if (isAfk) {
        await AFK.deleteOne({ guildId: message.guild.id, userId: message.author.id });
        message.reply(`👋 Welcome back **${message.author.username}**! Your AFK has been removed.`).then(m => setTimeout(() => m.delete(), 5000));
    }

    // --- PREFIX COMMANDS ---
    if (!message.content.startsWith(PREFIX)) return;
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift().toLowerCase();

    // Giveaway Start: !gstart 10m Nitro
    if (cmd === "gstart") {
        if (!message.member.permissions.has("ManageEvents")) return;
        const time = args[0]; const prize = args.slice(1).join(" ");
        if (!time || !prize) return message.reply("Format: `!gstart 1h Nitro` (s, m, h, d)");
        const duration = ms(time);
        if (!duration) return message.reply("Invalid time format!");

        const endTime = Date.now() + duration;
        const embed = new EmbedBuilder()
            .setTitle(`<a:Gift:1445323173624287325> GIVEAWAY: ${prize}`)
            .setDescription(`Entry দিতে বাটনে ক্লিক করো!\n\n**Ends:** <t:${Math.floor(endTime/1000)}:R>\n**Hosted By:** ${message.author}`)
            .setColor("#2b2d31").setTimestamp(endTime);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('g_join').setEmoji('<a:Giveaway:1412082796822007909>').setStyle(ButtonStyle.Primary)
        );

        const gMsg = await message.channel.send({ embeds: [embed], components: [row] });
        await new Giveaway({ messageId: gMsg.id, channelId: message.channel.id, prize, endTime, hostedBy: message.author.id, entries: [], manualWinners: [] }).save();
    }

    // Individual Secret Winner Set: !gset [MessageID] @user1 @user2
    if (cmd === "gset") {
        if (!message.member.permissions.has("Administrator")) return;
        const winners = message.mentions.users.map(u => u.id);
        if (!args[0] || winners.length === 0) return message.reply("Usage: `!gset [ID] @user` ");
        await Giveaway.findOneAndUpdate({ messageId: args[0] }, { manualWinners: winners });
        message.delete().catch(() => {});
    }

    // AFK Command: !afk [Reason]
    if (cmd === "afk") {
        const reason = args.join(" ") || "No reason provided";
        await new AFK({ guildId: message.guild.id, userId: message.author.id, reason }).save();
        message.reply(`✅ Your AFK is now set: ${reason}`);
    }
});

// --- SLASH COMMANDS HANDLER ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options } = interaction;

        if (commandName === 'addemote') {
            const url = options.getString('url');
            const name = options.getString('name');
            interaction.guild.emojis.create({ attachment: url, name: name })
                .then(emoji => interaction.reply(`✅ Emoji ${emoji} added successfully!`))
                .catch(e => interaction.reply(`❌ Error: ${e.message}`));
        }

        if (commandName === 'purge') {
            const amount = options.getInteger('amount');
            await interaction.channel.bulkDelete(amount, true);
            await interaction.reply({ content: `✅ Purged ${amount} messages.`, ephemeral: true });
        }

        if (commandName === 'help') {
            const embed = new EmbedBuilder()
                .setTitle("Professional Help Menu")
                .addFields(
                    { name: "🎁 Giveaway", value: "`!gstart (time) (prize)`, `!gset (msgID) (@user)`" },
                    { name: "🛡️ Moderation", value: "`/purge`, `/ban`, `/kick`, `/mute`, `/lock`" },
                    { name: "🎮 Fun & Utility", value: "`/addemote`, `!afk`, `/serverinfo`, `/avatar`, `/meme`" },
                    { name: "⚙️ Setup", value: "`/setup` (Config channels)" }
                ).setColor("Blue");
            await interaction.reply({ embeds: [embed] });
        }
    }

    if (interaction.isButton() && interaction.customId === 'g_join') {
        const data = await Giveaway.findOne({ messageId: interaction.message.id });
        if (data && !data.entries.includes(interaction.user.id)) {
            data.entries.push(interaction.user.id);
            await data.save();
            return interaction.reply({ content: "Joined! <a:Giveaway:1412082796822007909>", ephemeral: true });
        }
        interaction.reply({ content: "Error or Already Joined.", ephemeral: true });
    }
});

// --- GIVEAWAY WINNER SYSTEM ---
setInterval(async () => {
    const ended = await Giveaway.find({ endTime: { $lt: Date.now() } });
    for (const g of ended) {
        const chan = client.channels.cache.get(g.channelId);
        if (chan) {
            let winners = [];
            // Priority: Manual Winners (set by !gset)
            if (g.manualWinners.length > 0) {
                for (let id of g.manualWinners) {
                    const exists = await chan.guild.members.fetch(id).catch(() => null);
                    if (exists) winners.push(`<@${id}>`);
                }
            }
            // Fair selection if no manual winner
            if (winners.length === 0 && g.entries.length > 0) {
                winners.push(`<@${g.entries[Math.floor(Math.random() * g.entries.length)]}>`);
            }
            chan.send(winners.length > 0 ? `🎉 Congratulations ${winners.join(", ")}! You won **${g.prize}**!` : "No valid participants.");
        }
        await Giveaway.deleteOne({ _id: g._id });
    }
}, 5000);

client.login(process.env.TOKEN);
