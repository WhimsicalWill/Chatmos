import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: 'http://localhost:5000', // This is the default port for Flask apps
});

class ApiManager {
  static async submitTopicAndGetResponse(message, userID) {
    try {
      const botResponse = await axiosInstance.get('/bot-response', {
        params: { 
          topic: message,
          userID: userID,
        }
      });

      // Add the new topic to the database
      axiosInstance.post(`/user-topics/${userID}`, {
        title: message,
      });

      const convMatches = botResponse.data.convMatches;
      const segwayResponses = botResponse.data.segwayResponses.split('\n');

      const combined = segwayResponses.map((segwayResponse, i) => ({
        text: segwayResponse,
        matchInfo: convMatches[i]
      }));
      return combined;
    } catch (error) {
      console.error(error);
      return [{ text: "An error occurred :(", matchInfo: null }]; // return an array with one element in the case of an error
    }
  }

  // Add function to create a new chat
  static async getNextUserID() {
    try {
      // modify the api call to feed in the two users
      const response = await axiosInstance.get('/next-user-id');
      console.log(response.data);
      return response.data.nextUserID;
    } catch (error) {
      console.error(error);
      return null; // return null in the case of an error
    }
  }

  // TODO: make sure that the arguments are passed correctly
  // the creator is the person whose topic was in the DB first
  static async createChatAndGetID(userCreatorID, userMatchedID, creatorTopicID, matchedTopicID) {
    console.log('Creating match with', userCreatorID);
    try {
      const response = await axiosInstance.post('/chatmetadata', {
        userCreatorID: userCreatorID,
        userMatchedID: userMatchedID,
        creatorTopicID: creatorTopicID,
        matchedTopicID: matchedTopicID,
      });

      const chatID = response.data.chatID;
      return chatID;
    } catch (error) {
      console.error('Failed to create a new chat:', error);
      return null;
    }
  }

  static async getTopicsAndChats(userID, setTopics) {
    try {
      let topicInfo = await ApiManager.getTopics(userID);

      let brainstormTopic = topicInfo.find(topic => topic.title === 'Brainstorm');
      let brainstormTopicID = brainstormTopic ? String(brainstormTopic.id) : null;

      if (!brainstormTopic) {
        console.log('Creating brainstorm topic/chat now');
        const brainstormResponse = await ApiManager.createBrainstorm(userID);
        brainstormTopicID = brainstormResponse.id;
        topicInfo = topicInfo.concat(brainstormResponse);
      }

      const topics = {};

      const chatPromises = topicInfo.map((topic) => {
        return ApiManager.getChatsByTopicID(topic.id, userID);
      });

      // This allows all of our API calls to resolve in parallel
      await Promise.all(chatPromises)
        .then((results) => {
          results.forEach((topicChats, i) => {
            const topic = topicInfo[i];
            topics[topic.id] = {
              title: topic.title,
              ...topicChats,
            };
          });
        })
        .catch((err) => console.log(err));

      setTopics(topics);
      const brainstormChatID = ApiManager.getBrainstormChat(topics, brainstormTopicID);
      return [brainstormTopicID, brainstormChatID];
    } catch (error) {
      console.error(error);
    }
  }

  static async getTopics(userID) {
    try {
      const response = await axiosInstance.get(`/user-topics/${userID}`);
      return response.data;
    } catch (error) {
      console.error(error);
      return [];
    }
  }

  static async getChatsByTopicID(topicID, userID) {
    try {
      const topicChats = {};
      const response = await axiosInstance.get(`/chatmetadata/${topicID}`);
      response.data.forEach(chatResponse => {
        topicChats[chatResponse.chatID] = { 
          name: `Chat ${chatResponse.chatID}`, 
          otherUserID: userID == chatResponse.userCreatorID ? chatResponse.userMatchedID : chatResponse.userCreatorID,
          messages: []
        };
      });
      return topicChats;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log(`No chats found for topic ${topicID}`);
      } else {
        console.error(error);
      }
    }
  }

  static async createBrainstorm(userID) {
    try {
      // Attempt to create the 'Brainstorm' topic
      const topicResponse = await axiosInstance.post(`/user-topics/${userID}`, {
        title: 'Brainstorm'
      });

      if (topicResponse.status === 201) {
        // TODO: just call ApiManager.createChatandGetID here
        // If successful, create the 'Brainstorm' chat under this topic
        const chatResponse = await axiosInstance.post('/create-chat', {
          creatorTopicID: topicResponse.data.id,
          matchedTopicID: -1,
          userCreatorID: userID,
          userMatchedID: -1,
        });

        if (chatResponse.status === 201) {
          // TODO: set the brainstormID.ref to the chatID
          console.log(`Brainstorm topic and chat created for user ${userID}`);
          return { id: String(topicResponse.data.id), title: 'Brainstorm' };
        }
      }
    } catch (creationError) {
      // Log an appropriate error if the creation process fails
      console.error('Error creating Brainstorm topic or chat: ', creationError);
    }
    return null;
  }

  static getBrainstormChat(topics, brainstormTopicID) {
    // find the child element that is not the title
    const brainstormChatID = Object.keys(topics[brainstormTopicID]).find(
      key => key !== 'title'
    ) || null;
    return brainstormChatID;
  }
}

export default ApiManager;
