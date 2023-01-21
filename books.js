const fs = require('node:fs');
const path = require('node:path');
const { ActionRowBuilder, ButtonBuilder, Client, Collection, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { request } = require('undici');
const { token, apiKey } = require('./auth.json');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath);
	client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, () => {
	console.log('Ready!');
});

// Bugs List
// 1. fixed - inside the nba bubble > click Forward > error [ExpectedConstraintError: Invalid URL]
        // cause: empty url for setImage in embed
// 2. fixed - 1984 > Error
// 2a. fixed - diary of anne frank > TypeError: Cannot read properties of undefined (reading 'join')
//     at getResults (44:48) // resObj.author = result.authors.join(',');
        // cause: empty author results
// 3. fixed - rusty loves marLON > Error
        // cause: empty ratings/page count
// 5. complete - test empty data
        // tested empty pageCount results in 'N/A'

client.on(Events.InteractionCreate, async interaction => {
    function limit(textSnippet) {
        return textSnippet.substring(0,1000) + ' (more...)'; // TODO: ERROR HANDLING
    }

    function limitMultiple(textSnippet) {
        return textSnippet.substring(0,700) + ' (more...)'; // TODO: ERROR HANDLING
    }

    function getResults(searchResults, resultCount) {
        const resArr = [];
        resultCount = Math.min(resultCount, searchResults.items.length);

        for (let i = 0; i < resultCount; i += 1) {
            const result = searchResults.items[i].volumeInfo;
            console.log('getResults', result);

            // Only continue if has results
            if (result && result != null) {
                const resObj = {};
                resObj.title = result.title || 'N/A';
                resObj.publishedDate = result.publishedDate || 'N/A';
                resObj.author = result.authors ? result.authors.join(',') : 'N/A';
                resObj.rating =  result.averageRating ? result.averageRating + ' (' + result.ratingsCount + ' ratings)' : 'N/A';
                resObj.pageCount = result.pageCount || 'N/A';
                resObj.description = 'N/A';
                if (result.description && result.description !== null) {
                    if (resultCount == 1) {
                        resObj.description = limit(result.description);
                    } else {
                        resObj.description = limitMultiple(result.description);
                    }
                }
                
                // Single Result Items?
                resObj.link = result.infoLink || 'N/A';
                resObj.thumbnailUrl = null;
                if (result.imageLinks) {
                    resObj.thumbnailUrl = result.imageLinks.thumbnail;
                }

                resArr.push(resObj);
            } else {
                break;
            }
        }
        
        return resArr;
    }

	if (!interaction.isChatInputCommand()) return;

	const command = client.commands.get(interaction.commandName);

	const { commandName } = interaction;
	await interaction.deferReply();

    if (commandName === 'lookup') {
        // Get the results of the lookup
        const pageSize = 1;
        const lookupResults = 15;
        const searchTerm = interaction.options.getString('search-term');
        const { statusCode, body} = await request("https://www.googleapis.com/books/v1/volumes?maxResults=40&q=" + searchTerm + "&key=" + apiKey);
        console.log(statusCode);

        if (statusCode !== 200) {
            interaction.editReply('Could not reach server');
        } else {
            // Get Body to Parse
            const searchResults = await body.json();
            // Get Results
            const results = getResults(searchResults, lookupResults); 

            // UI Builder
            const backId = 'back';
            const forwardId = 'forward';
            const backButton = new ButtonBuilder({
                style: 1,
                label: 'Back',
                emoji: '⬅️',
                customId: backId
            });
            const forwardButton = new ButtonBuilder({
                style: 2,
                label: 'Forward',
                emoji: '➡️',
                customId: forwardId
            });

            // Generate Pages
            const author = interaction.user.id;
            const channel = interaction.channel.guild.systemChannelId;

            /**
             * Creates an embed with guilds starting from an index.
             * @param {number} start The index to start from.
             * @returns {Promise<MessageEmbed>}
             */
            const generateEmbed = async start => {
                const current = results.slice(start, start + pageSize)

                // You can of course customise this embed however you want
                const embedResults = new EmbedBuilder({
                    title: `${searchTerm} search results ${start + current.length} out of ${
                    results.length
                    }`, // Change hyperlink to be on title
                    fields: await Promise.all(
                    current.map(async result => ({ // TODO: Add Links
                        name: result.title,
                        value: `**Date Published:** ${result.publishedDate}\n
                                **Author:** ${result.author}\n
                                **Rating:** ${result.rating}\n
                                **Page Count:** ${result.pageCount}\n
                                **Description:** ${result.description}\n`
                    }))
                    )
                });
                if (current[0].thumbnailUrl && current[0].thumbnailUrl !== null) {
                    embedResults.setImage(current[0].thumbnailUrl);
                }
                if (current[0].link && current[0].link !== null) {
                    embedResults.setURL(current[0].link)
                }

                return embedResults;
            }

            // Send the embed with the first 10 guilds
            const canFitOnOnePage = results.length <= pageSize;
            const embedMessage = await interaction.editReply({
                embeds: [await generateEmbed(0)],
                components: canFitOnOnePage
                    ? []
                    : [new ActionRowBuilder({components: [forwardButton]})]
            });
            // Exit if there is only one page of guilds (no need for all of this)
            if (canFitOnOnePage) return

            // Collect button interactions (when a user clicks a button),
            // but only when the button as clicked by the original message author
            const collector = embedMessage.createMessageComponentCollector({
                filter: ({user}) => user.id === author
            });

            let currentIndex = 0;
            collector.on('collect', async interaction => {
                // Increase/decrease index
                interaction.customId === backId ? (currentIndex -= pageSize) : (currentIndex += pageSize)
                // Respond to interaction by updating message with new embed
                await interaction.update({
                    embeds: [await generateEmbed(currentIndex)],
                    components: [
                        new ActionRowBuilder({
                            components: [
                            // back button if it isn't the start
                            ...(currentIndex ? [backButton] : []),
                            // forward button if it isn't the end
                            ...(currentIndex + pageSize < results.length ? [forwardButton] : [])
                            ]
                        })
                    ]
                })
            })
        }
    }

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
	}
});

client.login(token);