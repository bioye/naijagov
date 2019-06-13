package com.naijagov.naijagov.service;

import java.util.Optional;

import com.naijagov.naijagov.model.PollingUnit;
import com.naijagov.naijagov.repository.PollingUnitRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

@Service("pollingUnitService")
public class PollingUnitService{

    public Optional<PollingUnit> findPollingUnit(int id){
        return pollingUnitRepository.findById(id);
    }

    public Page<PollingUnit> listAllPollingUnits(Pageable page){
        return pollingUnitRepository.findAll(page);
    }

    @Autowired
    public PollingUnitService(PollingUnitRepository pollingUnitRepository){
        this.pollingUnitRepository=pollingUnitRepository;
    }
    private PollingUnitRepository pollingUnitRepository;
}