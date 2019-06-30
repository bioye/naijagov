'use strict';

import React, { Component } from "react";
import ReactDOM from "react-dom";
import MaterialTable from "material-table";

const client = require('./client');
const follow = require('./follow');
const root = '/api';

class PollingUnitsMaterial extends Component {

	constructor(props) {
		super(props);
		this.state = {pollingunits: [], attributes: [], pageSize: 10, links: {}, index: []};
	}

	loadFromServer(pageSize) {
		follow(client, root, [
			{rel: 'pollingCentres', params: {size: pageSize}}]
		).then(pollingunitCollection => {
			return client({
				method: 'GET',
				path: pollingunitCollection.entity._links.profile.href,
				headers: {'Accept': 'application/schema+json'}
			}).then(schema => {
				this.schema = schema.entity;
				return pollingunitCollection;
			});
		}).done(pollingunitCollection => {
			this.setState({
                pollingunits: pollingunitCollection.entity._embedded.pollingCentres,
				attributes: Object.keys(this.schema.properties),
				pageSize: pageSize,
				links: pollingunitCollection.entity._links});
		});
	}
	componentDidMount() {
		this.loadFromServer(this.state.pageSize);
	}
    render() {
        return (
        <div style={{ maxWidth: "100%" }}>
            <MaterialTable
            columns={[
                { title: "Code", field: "fullCode" },
                { title: "Description", field: "description" },
                { title: "Longitude", field: "longitude", type: "numeric" },
                { title: "Latitude", field: "latitude", type: "numeric" }
            ]}
            data={this.state.pollingunits}
            title="Polling Units"
            />
        </div>
    );
  }
}

ReactDOM.render(<PollingUnitsMaterial />, document.getElementById("react"));