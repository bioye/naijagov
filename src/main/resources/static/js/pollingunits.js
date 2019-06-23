'use strict';

const React = require('react');
const ReactDOM = require('react-dom');
const client = require('./client');

const follow = require('./follow');

const root = '/api';

class PollingUnitsComponent extends React.Component {

	constructor(props) {
		super(props);
		this.state = {pollingunits: [], attributes: [], pageSize: 10, links: {}};
		this.updatePageSize = this.updatePageSize.bind(this);
		this.onNavigate = this.onNavigate.bind(this);
	}

	loadFromServer(pageSize) {
		follow(client, root, [
			{rel: 'pollingUnits', params: {size: pageSize}}]
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
				pollingunits: pollingunitCollection.entity._embedded.pollingUnits,
				attributes: Object.keys(this.schema.properties),
				pageSize: pageSize,
				links: pollingunitCollection.entity._links});
		});
	}

	onNavigate(navUri) {
		client({method: 'GET', path: navUri}).done(pollingunitCollection => {
			this.setState({
				pollingunits: pollingunitCollection.entity._embedded.pollingUnits,
				attributes: this.state.attributes,
				pageSize: this.state.pageSize,
				links: pollingunitCollection.entity._links
			});
		});
	}

	updatePageSize(pageSize) {
		if (pageSize !== this.state.pageSize) {
			this.loadFromServer(pageSize);
		}
	}

	componentDidMount() {
		this.loadFromServer(this.state.pageSize);
	}
	render() {
		return (
			<div>
				<PollingUnits pollingunits={this.state.pollingunits}
							  links={this.state.links}
							  pageSize={this.state.pageSize}
							  onNavigate={this.onNavigate}
							  updatePageSize={this.updatePageSize}/>
			</div>
		)
	}
}

class PollingUnits extends React.Component{

	constructor(props) {
		super(props);
		this.handleNavFirst = this.handleNavFirst.bind(this);
		this.handleNavPrev = this.handleNavPrev.bind(this);
		this.handleNavNext = this.handleNavNext.bind(this);
		this.handleNavLast = this.handleNavLast.bind(this);
		this.handleInput = this.handleInput.bind(this);
	}

	handleInput(e) {
		e.preventDefault();
		const pageSize = ReactDOM.findDOMNode(this.refs.pageSize).value;
		if (/^[0-9]+$/.test(pageSize)) {
			this.props.updatePageSize(pageSize);
		} else {
			ReactDOM.findDOMNode(this.refs.pageSize).value =
				pageSize.substring(0, pageSize.length - 1);
		}
	}
	
	handleNavFirst(e){
		e.preventDefault();
		this.props.onNavigate(this.props.links.first.href);
	}

	handleNavPrev(e) {
		e.preventDefault();
		this.props.onNavigate(this.props.links.prev.href);
	}

	handleNavNext(e) {
		e.preventDefault();
		this.props.onNavigate(this.props.links.next.href);
	}

	handleNavLast(e) {
		e.preventDefault();
		this.props.onNavigate(this.props.links.last.href);
	}
	
	render() {
		const pollingunits = this.props.pollingunits.map(pollingunit =>
			<PollingUnit key={pollingunit._links.self.href} pollingunit={pollingunit}/>
		);
		const navLinks = [];
		if ("first" in this.props.links) {
			navLinks.push(<button key="first" onClick={this.handleNavFirst}>&lt;&lt;</button>);
		}
		if ("prev" in this.props.links) {
			navLinks.push(<button key="prev" onClick={this.handleNavPrev}>&lt;</button>);
		}
		if ("next" in this.props.links) {
			navLinks.push(<button key="next" onClick={this.handleNavNext}>&gt;</button>);
		}
		if ("last" in this.props.links) {
			navLinks.push(<button key="last" onClick={this.handleNavLast}>&gt;&gt;</button>);
		}
		return (
			<div>
				<input ref="pageSize" defaultValue={this.props.pageSize} onInput={this.handleInput}/>
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
				<div>
					{navLinks}
				</div>
			</div>
		)
	}
}
class PollingUnit extends React.Component{

	constructor(props) {
		super(props);
	}

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