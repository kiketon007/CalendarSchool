describe('GET /api/health through the preview proxy', () => {
  it('responds 200 with the service and database status', () => {
    cy.request('/api/health').then((response) => {
      expect(response.status).to.equal(200);
      expect(response.headers['content-type']).to.match(/application\/json/);
      expect(response.body).to.deep.equal({
        success: true,
        data: { status: 'ok', database: 'up' },
      });
    });
  });
});
