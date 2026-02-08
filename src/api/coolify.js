const axios = require('axios');

class CoolifyAPI {
  constructor(baseUrl, token) {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  async getServers() {
    const { data } = await this.client.get('/servers');
    return data;
  }

  async getServer(nameOrUuid) {
    const servers = await this.getServers();
    return servers.find(s =>
      s.name === nameOrUuid || s.uuid === nameOrUuid
    );
  }

  async getServerByName(name) {
    const servers = await this.getServers();
    return servers.find(s => s.name === name);
  }

  async getServices() {
    const { data } = await this.client.get('/services');
    return data;
  }

  async getService(uuid) {
    const { data } = await this.client.get(`/services/${uuid}`);
    return data;
  }

  async getApplications() {
    const { data } = await this.client.get('/applications');
    return data;
  }

  async getApplication(uuid) {
    const { data } = await this.client.get(`/applications/${uuid}`);
    return data;
  }

  async getResources() {
    const { data } = await this.client.get('/resources');
    return data;
  }

  async getDatabases() {
    const { data } = await this.client.get('/databases');
    return data;
  }

  async cloneService(uuid, targetServerId, destinationId) {
    const { data } = await this.client.post(`/services/${uuid}/clone`, {
      server_id: targetServerId,
      destination_id: destinationId
    });
    return data;
  }

  async cloneApplication(uuid, targetServerId, destinationId) {
    const { data } = await this.client.post(`/applications/${uuid}/clone`, {
      server_id: targetServerId,
      destination_id: destinationId
    });
    return data;
  }
}

module.exports = CoolifyAPI;
