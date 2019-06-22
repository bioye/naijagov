'use strict';

const React = require('react');
const ReactDOM = require('react-dom');
const client = require('./client');

class PollingUnitsComponent extends React.Component {

	constructor(props) {
		super(props);
		this.state = {pollingunits: []};
	}
	componentDidMount() {
		client({method: 'GET', path: '/api/pollingUnits'}).done(response => {
			this.setState({pollingunits: response.entity._embedded.pollingUnits});
		});
	}
	render() {
		return (
			<PollingUnits pollingunits={this.state.pollingunits}/>
		)
	}
}
class PollingUnits extends React.Component{
	render() {
		//if (this.props.data) {
			const pollingunits = this.props.pollingunits.map(pollingunit =>
				<PollingUnit key={pollingunit._links.self.href} pollingunit={pollingunit}/>
			);
		//}
		return (
			<table>
				<tbody>
					<tr>
                        <th>#</th>
                        <th>Code</th>
                        <th>Description</th>
                        <th>Longitude</th>
                        <th>Latitude</th>
					</tr>
						{pollingunits}
				</tbody>
			</table>
		)
	}
}
class PollingUnit extends React.Component{
	render() {
		return (
			<tr>
                <td>#</td>
				<td>{this.props.pollingunit.code}</td>
				<td>{this.props.pollingunit.description}</td>
				<td>{this.props.pollingunit.longitude}</td>
				<td>{this.props.pollingunit.latitude}</td>
			</tr>
		)
	}
}

ReactDOM.render(
	<PollingUnitsComponent />,
	document.getElementById('react')
)