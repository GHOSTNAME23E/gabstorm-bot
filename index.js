const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const express = require('express');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('database.json');
const db = low(adapter);
db.defaults({ keys: [], users: [] }).write();

const app = express();
app.use(express.json());

// API de Autenticação / Login / Registro
app.post('/api/auth', (req, res) => {
    const { username, password, key } = req.body;

    // Tenta achar usuário existente
    const user = db.get('users').find({ username: username }).value();

    if (user) {
        // Validação de senha
        if (user.password !== password) {
            return res.status(400).json({ success: false, message: 'Senha incorreta!' });
        }

        // Verifica expiração da conta
        if (Date.now() > user.expiresAt) {
            return res.status(403).json({ success: false, message: 'Sua assinatura expirou!' });
        }

        const diasRestantes = Math.ceil((user.expiresAt - Date.now()) / (1000 * 60 * 60 * 24));
        return res.json({ success: true, message: 'Login realizado com sucesso!', dias: diasRestantes });
    } 
    else {
        // Se o usuário não existe, exige uma Key para Registrar
        if (!key) {
            return res.status(400).json({ success: false, message: 'Usuário não existe. Insira uma Key válida para registrar.' });
        }

        const dbKey = db.get('keys').find({ key: key, used: false }).value();
        if (!dbKey) {
            return res.status(400).json({ success: false, message: 'Key inválida ou já utilizada!' });
        }

        const expiresAt = Date.now() + (dbKey.dias * 24 * 60 * 60 * 1000);

        // Queima a key e registra o usuário
        db.get('keys').find({ key: key }).assign({ used: true, user: username }).write();
        db.get('users').push({ username: username, password: password, expiresAt: expiresAt }).write();

        return res.json({ success: true, message: 'Conta criada e ativada com sucesso!', dias: dbKey.dias });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`[API] Servidor Gab Storm rodando na porta ${PORT}`));

// Bot do Discord
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const CLIENT_ID = "1563624728646783027";

client.once('ready', async () => {
    console.log(`[BOT] ${client.user.tag} online!`);
    const commands = [
        new SlashCommandBuilder()
            .setName('gerarkey')
            .setDescription('Gera uma key de acesso para o Gab Storm')
            .addIntegerOption(opt => opt.setName('dias').setDescription('Dias de acesso').setRequired(true))
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('[BOT] Comandos Slash registrados com sucesso!');
    } catch (error) {
        console.error('[BOT] Erro ao registrar comandos:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'gerarkey') {
        const dias = interaction.options.getInteger('dias');
        const randomKey = 'GAB-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();

        db.get('keys').push({ key: randomKey, dias: dias, used: false, user: null }).write();

        const embed = new EmbedBuilder()
            .setColor('#121212')
            .setTitle('GAB STORM • Key Criada')
            .addFields(
                { name: 'Key:', value: `\`${randomKey}\`` },
                { name: 'Duração:', value: `${dias} Dia(s)` }
            )
            .setFooter({ text: 'Gab Storm Security • dev Vitor ‧ Gxblin' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

// Faz o login do bot utilizando a variável de ambiente segura do Render
client.login(process.env.DISCORD_TOKEN);
