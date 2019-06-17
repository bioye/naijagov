package com.naijagov.naijagov.model;

import org.springframework.data.domain.Page;

public class Form {

    public Page<PollingUnit> getPollingUnitsPage() {
        return pollingUnitsPage;
    }

    public Iterable<PollingUnit> getPollingUnits() {
        return pollingUnits;
    }

    public void setPollingUnitsPage(Page<PollingUnit> pollingUnitPage) {
        this.pollingUnitsPage = pollingUnitPage;
    }

    public void setPollingUnits(Iterable<PollingUnit> pollingUnits) {
        this.pollingUnits = pollingUnits;
    }

    private Page<PollingUnit> pollingUnitsPage;
    private Iterable<PollingUnit> pollingUnits;
}