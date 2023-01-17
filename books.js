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
// 1. inside the nba bubble > click Forward > error [ExpectedConstraintError: Invalid URL]
// 2. 1984 > Error
// 3. rusty loves marLON > Error

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

            // Only continue if has results
            if (result && result != null) {
                const resObj = {};
                resObj.title = result.title;
                resObj.publishedDate = result.publishedDate;
                resObj.author = result.authors.join(',');
                resObj.rating =  result.averageRating + ' (' + result.ratingsCount + ' ratings)';
                resObj.pageCount = result.pageCount;
                resObj.description = '';
                if (result.description && result.description !== null) {
                    if (resultCount == 1) {
                        resObj.description = limit(result.description);
                    } else {
                        resObj.description = limitMultiple(result.description);
                    }
                }
                
                // Single Result Items?
                resObj.link = result.infoLink;
                resObj.thumbnailUrl = '';
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

    /* if (commandName === 'lookup') {
        // Get the results of the lookup
        const searchTerm = interaction.options.getString('search-term');
		const { statusCode, body} = await request("https://www.googleapis.com/books/v1/volumes?maxResults=40&q=" + searchTerm + "&key=" + apiKey);
        console.log(statusCode);

        if (statusCode !== 200) {
            interaction.editReply('Could not reach server');
        } else {
            // Get Body to Parse
            const searchResults = await body.json();

            // Only get first result for now. Could loop and add scrolling
            // TEMPORARY RESULT LOGGING
            const singleResult = getResults(searchResults, 1); 
            // console.log('results', singleResult);
            
            // TODO: ADD NO RESULT CONDITION. EMPTY EMBED?

            try {
                const embed = new EmbedBuilder()
                    .setColor(0xEFFF00)
                    .setTitle(singleResult[0].title)
                    .setURL(singleResult[0].link)
                    .setImage(singleResult[0].thumbnailUrl)
                    .addFields({
                        name: 'Search Term',
                        value: searchTerm
                    }, 
                    {
                        name: 'Date Published',
                        value: singleResult[0].publishedDate || ''
                    },
                    {
                        name: 'Author',
                        value: singleResult[0].author || ''
                    },
                    {
                        name: 'Rating',
                        value: singleResult[0].rating || ''
                    },
                    {
                        name: 'Page Count',
                        value: singleResult[0].pageCount + '' || ''
                    },
                    {
                        name: 'Description',
                        value: limit(singleResult[0].description) || ''
                    }) 

                interaction.editReply({ embeds: [embed] });
            } catch (e) {
                console.log(e.message);
            }
        }
        
	} else */ 
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
                return new EmbedBuilder({
                    title: `${searchTerm} search results ${start + current.length} out of ${
                    results.length
                    }`, // Change hyperlink to be on title
                    url: current[0].link,
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
                }).setImage(current[0].thumbnailUrl);
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